/** One shared AudioContext. Mobile browsers start it suspended until a user gesture,
 * so call unlockAudio() from a tap handler (the NFC start tap). */
let ctx: AudioContext | null = null

export function audioContext(): AudioContext | null {
  if (ctx) return ctx
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  ctx = new C()
  return ctx
}

export function unlockAudio(): void {
  const c = audioContext()
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined)
}
