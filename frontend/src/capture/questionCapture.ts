/**
 * Captures a spoken question from the microphone stream that is already streaming.
 * It taps the same MediaStream through the Web Audio graph (no second getUserMedia,
 * no second recorder), so the ongoing voice stream is not interrupted.
 * Output is 16 kHz mono WAV, which speech models accept everywhere.
 */
import { audioContext } from '../lib/audio'

const TARGET_RATE = 16_000
const MAX_MS = 30_000

export interface QuestionCapture {
  stop(): Promise<{ blob: Blob; durationMs: number }>
  cancel(): void
}

export function startQuestionCapture(stream: MediaStream): QuestionCapture {
  const ctx = audioContext()
  if (!ctx) throw new Error('이 기기에서는 음성 질문을 지원하지 않습니다')
  void ctx.resume().catch(() => undefined)
  const source = ctx.createMediaStreamSource(stream)
  // ScriptProcessor is deprecated but universally available and needs no extra module file.
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const mute = ctx.createGain()
  mute.gain.value = 0 // keep the graph pulling audio without playing it back
  const chunks: Float32Array[] = []
  const started = Date.now()
  proc.onaudioprocess = (e) => {
    if (Date.now() - started > MAX_MS) return
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  source.connect(proc)
  proc.connect(mute)
  mute.connect(ctx.destination)

  const teardown = () => {
    proc.onaudioprocess = null
    source.disconnect()
    proc.disconnect()
    mute.disconnect()
  }

  return {
    cancel: teardown,
    async stop() {
      teardown()
      const durationMs = Date.now() - started
      return { blob: encodeWav(downsample(concat(chunks), ctx.sampleRate, TARGET_RATE), TARGET_RATE), durationMs }
    },
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
