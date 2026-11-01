/**
 * Field voice capture. Records the microphone in short segments; each segment is a
 * standalone, playable file handed to `onSegment` (uploaded right away, so a closed app
 * loses at most one segment). STT / LLM structuring happens later on the server side.
 *
 * Segments are cut at a pause in speech (between `segmentMs * 0.8` and `segmentMs * 1.5`)
 * so a sentence is not split in the middle — STT drops words at a hard cut.
 */
export interface VoiceClip {
  blob: Blob
  mimeType: string
  startedAt: string
  durationMs: number
  /** Opaque value captured when the segment started (the check-in event id). */
  context?: string
}

export function voiceCaptureSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia
}

function pickMimeType(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

const TICK_MS = 100
const PAUSE_RMS = 0.012 // below this the speaker is pausing
const PAUSE_MS = 350 // pause long enough to cut there

export class SegmentRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private timer: number | undefined
  private running = false
  private segStart = 0
  private quietMs = 0
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null

  constructor(
    private onSegment: (clip: VoiceClip) => void,
    private getContext: () => string | undefined = () => undefined,
    private segmentMs = 60_000,
  ) {}

  get active(): boolean {
    return this.running
  }

  get mediaStream(): MediaStream | null {
    return this.stream
  }

  async start(): Promise<void> {
    if (this.running) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    })
    // level meter for pause-cutting — optional, falls back to fixed-length cuts
    try {
      this.ctx = new AudioContext()
      void this.ctx.resume().catch(() => undefined)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
      this.buf = new Float32Array(this.analyser.fftSize)
    } catch {
      this.ctx = this.analyser = this.buf = null
    }
    this.running = true
    this.recordSegment()
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
  }

  /** Closes the current segment now and keeps recording (e.g. after moving to another zone). */
  cut(): void {
    if (!this.running) return
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
  }

  /** Ends the current segment (delivered via onSegment) and releases the microphone. */
  stop(): void {
    this.running = false
    window.clearInterval(this.timer)
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    else this.release()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = this.analyser = this.buf = null
  }

  private tick() {
    if (!this.recorder || this.recorder.state !== 'recording') return
    const elapsed = Date.now() - this.segStart
    let pauseCut = false
    if (this.analyser && this.buf && this.ctx?.state === 'running') {
      this.analyser.getFloatTimeDomainData(this.buf)
      let sum = 0
      for (const v of this.buf) sum += v * v
      this.quietMs = Math.sqrt(sum / this.buf.length) < PAUSE_RMS ? this.quietMs + TICK_MS : 0
      pauseCut = elapsed >= this.segmentMs * 0.8 && this.quietMs >= PAUSE_MS
    } else if (elapsed >= this.segmentMs) pauseCut = true // no level meter: plain fixed-length segments
    if (pauseCut || elapsed >= this.segmentMs * 1.5) this.recorder.stop()
  }

  private recordSegment() {
    if (!this.stream) return
    const mimeType = pickMimeType()
    const rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    const startedAt = new Date()
    const context = this.getContext()
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.getTime()
      if (chunks.length && durationMs > 800) {
        this.onSegment({
          blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }),
          mimeType: rec.mimeType || 'audio/webm',
          startedAt: startedAt.toISOString(),
          durationMs,
          context,
        })
      }
      if (this.running) this.recordSegment()
      else this.release()
    }
    this.recorder = rec
    this.segStart = startedAt.getTime()
    this.quietMs = 0
    rec.start()
  }
}
