const KEY = 'ovot.device'

/** Random per-browser id, stored only as client metadata on location events. */
export function getDeviceId(): string | undefined {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0')
      id = `DEV-${rand.toUpperCase()}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}
