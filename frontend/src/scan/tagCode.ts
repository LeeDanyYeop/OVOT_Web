/** Tag payloads may be a bare code ("OVOT-ZONE-A-001") or an app URL
 * ("https://host/?tag=OVOT-ZONE-A-001&src=nfc"). Both resolve to the opaque code. */
const CODE_RE = /OVOT-[A-Z0-9-]{3,58}/i

export function extractTagCode(payload: string): string | null {
  const text = payload.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    const fromParam = url.searchParams.get('tag')
    if (fromParam) return fromParam.trim().toUpperCase()
  } catch {
    /* not a URL */
  }
  const m = text.match(CODE_RE)
  return m ? m[0].toUpperCase() : null
}

export function tagUrl(origin: string, code: string, src: 'qr' | 'nfc'): string {
  return `${origin}/?tag=${encodeURIComponent(code)}&src=${src}`
}

export const DEMO_TAGS = [
  { code: 'OVOT-ZONE-A-001', label: 'A구역' },
  { code: 'OVOT-ZONE-B-001', label: 'B구역' },
  { code: 'OVOT-ZONE-C-001', label: 'C구역' },
  { code: 'OVOT-ZONE-OUT-001', label: '구역 밖' },
  { code: 'OVOT-ZONE-X-999', label: '미등록 태그' },
]
