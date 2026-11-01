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
