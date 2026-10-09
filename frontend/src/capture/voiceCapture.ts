/**
 * Field voice capture. Records the microphone in fixed-length segments; each segment is a
 * standalone, playable file handed to `onSegment` (uploaded right away, so a closed app
 * loses at most one segment). STT / LLM structuring happens later on the server side.
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

export class SegmentRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private timer: number | undefined
  private running = false

  constructor(
    private onSegment: (clip: VoiceClip) => void,
    private getContext: () => string | undefined = () => undefined,
    private segmentMs = 60_000,
  ) {}

  get active(): boolean {
    return this.running
  }

  async start(): Promise<void> {
    if (this.running) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    })
    this.running = true
    this.recordSegment()
  }

  /** Closes the current segment now and keeps recording (e.g. after moving to another zone). */
  cut(): void {
    if (!this.running) return
    window.clearTimeout(this.timer)
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
  }

  /** Ends the current segment (delivered via onSegment) and releases the microphone. */
  stop(): void {
    this.running = false
    window.clearTimeout(this.timer)
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    else this.release()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
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
    rec.start()
    this.timer = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), this.segmentMs)
  }
}
