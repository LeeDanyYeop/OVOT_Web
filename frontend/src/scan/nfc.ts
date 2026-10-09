/** Web NFC wrapper (Android Chrome, HTTPS only). Scanning starts only from a user gesture. */
import { extractTagCode } from './tagCode'

interface NDEFRecordLike {
  recordType: string
  encoding?: string
  data?: DataView
}
interface NDEFReadingEventLike extends Event {
  serialNumber: string
  message: { records: NDEFRecordLike[] }
}
interface NDEFReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  write(message: unknown, options?: { signal?: AbortSignal; overwrite?: boolean }): Promise<void>
}
type NDEFReaderCtor = new () => NDEFReaderLike

function ctor(): NDEFReaderCtor | undefined {
  return (window as unknown as { NDEFReader?: NDEFReaderCtor }).NDEFReader
}

export type NfcSupport = 'supported' | 'insecure' | 'unsupported'

export function nfcSupport(): NfcSupport {
  if (!('NDEFReader' in window) || !ctor()) return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  return 'supported'
}

export class NfcError extends Error {
  constructor(
    public kind: 'permission' | 'unsupported' | 'unreadable' | 'aborted' | 'unknown',
    message: string,
  ) {
    super(message)
  }
}

function mapError(err: unknown): NfcError {
  const name = (err as DOMException)?.name
  if (name === 'AbortError') return new NfcError('aborted', 'NFC 스캔을 취소했습니다.')
  if (name === 'NotAllowedError')
    return new NfcError('permission', 'NFC 권한이 거부되었습니다. 브라우저 사이트 설정에서 NFC를 허용하세요.')
  if (name === 'NotSupportedError')
    return new NfcError('unsupported', '휴대폰의 NFC가 꺼져 있거나 지원되지 않습니다. 설정에서 NFC를 켜세요.')
  return new NfcError('unknown', 'NFC를 시작할 수 없습니다. QR 또는 코드 입력을 사용하세요.')
}

function decodeRecord(r: NDEFRecordLike): string | null {
  if (!r.data) return null
  if (r.recordType === 'text' || r.recordType === 'url' || r.recordType === 'absolute-url' || r.recordType === 'mime') {
    return new TextDecoder(r.encoding || 'utf-8').decode(r.data)
  }
  return null
}

/** Resolves with the tag code from the first readable tag, or rejects. */
export async function scanTagOnce(signal: AbortSignal): Promise<string> {
  const Reader = ctor()
  if (!Reader) throw new NfcError('unsupported', '이 브라우저는 Web NFC를 지원하지 않습니다.')
  const reader = new Reader()
  try {
    await reader.scan({ signal })
  } catch (err) {
    throw mapError(err)
  }
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(new NfcError('aborted', 'NFC 스캔을 취소했습니다.'))
    signal.addEventListener('abort', onAbort, { once: true })
    reader.addEventListener('readingerror', () => {
      reject(new NfcError('unreadable', '태그를 읽지 못했습니다. 휴대폰 뒷면을 태그에 조금 더 오래 대세요.'))
    })
    reader.addEventListener('reading', (ev) => {
      const e = ev as NDEFReadingEventLike
      for (const record of e.message.records) {
        const text = decodeRecord(record)
        const code = text ? extractTagCode(text) : null
        if (code) {
          signal.removeEventListener('abort', onAbort)
          resolve(code)
          return
        }
      }
      reject(new NfcError('unreadable', 'OVOT 태그가 아닙니다. 구역 입구의 OVOT 태그를 스캔하세요.'))
    })
  })
}

/** Admin setup helper: writes an app URL record + a plain text code to a blank tag. */
export async function writeTag(url: string, code: string, signal: AbortSignal): Promise<void> {
  const Reader = ctor()
  if (!Reader) throw new NfcError('unsupported', '이 브라우저는 Web NFC를 지원하지 않습니다.')
  try {
    await new Reader().write(
      { records: [{ recordType: 'url', data: url }, { recordType: 'text', data: code, lang: 'en' }] },
      { signal },
    )
  } catch (err) {
    throw mapError(err)
  }
}

/** True when NFC permission was granted before, so scanning may start without a tap. */
export async function nfcPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'nfc' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}

/** Keeps listening until `signal` aborts; every OVOT tag read calls onCode. */
export async function listenForTags(
  signal: AbortSignal,
  onCode: (code: string) => void,
  onError: (err: NfcError) => void,
): Promise<void> {
  const Reader = ctor()
  if (!Reader) throw new NfcError('unsupported', '이 브라우저는 Web NFC를 지원하지 않습니다.')
  const reader = new Reader()
  try {
    await reader.scan({ signal })
  } catch (err) {
    throw mapError(err)
  }
  reader.addEventListener('readingerror', () =>
    onError(new NfcError('unreadable', '태그를 읽지 못했습니다. 휴대폰 뒷면을 태그에 조금 더 오래 대세요.')),
  )
  reader.addEventListener('reading', (ev) => {
    for (const record of (ev as NDEFReadingEventLike).message.records) {
      const text = decodeRecord(record)
      const code = text ? extractTagCode(text) : null
      if (code) {
        onCode(code)
        return
      }
    }
    onError(new NfcError('unreadable', 'OVOT 태그가 아닙니다. 구역 입구의 OVOT 태그를 대세요.'))
  })
}
