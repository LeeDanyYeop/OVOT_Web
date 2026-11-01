import type { RiskLevel } from '../types'

const timeFmt = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
})
const timeSecFmt = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
})
const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' })

export const hhmm = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—')
export const hhmmss = (iso: string | null | undefined) => (iso ? timeSecFmt.format(new Date(iso)) : '—')

export function dayAndTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const today = dateFmt.format(new Date())
  const day = dateFmt.format(d)
  return day === today ? timeFmt.format(d) : `${day} ${timeFmt.format(d)}`
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export const SOURCE_LABEL: Record<string, string> = {
  nfc: 'NFC',
  qr: 'QR',
  manual: '코드 입력',
  seed: '초기 데이터',
  checkout: '퇴근',
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: '고위험',
  medium: '주의',
  low: '일반',
}

export const REJECT_LABEL: Record<string, string> = {
  unknown_tag: '미등록 태그',
  inactive_tag: '사용 중지 태그',
  inactive_zone: '운영 중지 구역',
  invalid_format: '형식 오류',
}
