/** Camera QR scanning. Uses the native BarcodeDetector when present, jsQR otherwise. */
import jsQR from 'jsqr'

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike

export function cameraAvailable(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
}

export async function startQrScan(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  const stop = () => stream.getTracks().forEach((t) => t.stop())
  if (signal.aborted) {
    stop()
    return
  }
  signal.addEventListener('abort', stop, { once: true })
  video.srcObject = stream
  video.setAttribute('playsinline', 'true')
  await video.play()

  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  const detector = Native ? new Native({ formats: ['qr_code'] }) : null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const tick = async () => {
    if (signal.aborted) return
    if (video.readyState >= video.HAVE_ENOUGH_DATA) {
      try {
        let text: string | null = null
        if (detector) {
          const codes = await detector.detect(video)
          text = codes[0]?.rawValue ?? null
        } else if (ctx) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          text = jsQR(img.data, img.width, img.height)?.data ?? null
        }
        if (text) {
          stop()
          onResult(text)
          return
        }
      } catch {
        /* keep trying on transient detector errors */
      }
    }
    setTimeout(() => requestAnimationFrame(tick), 150)
  }
  requestAnimationFrame(tick)
}
