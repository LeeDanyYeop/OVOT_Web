import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome fires beforeinstallprompt once, possibly before React mounts, so capture it at module load.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export type InstallMode = 'prompt' | 'ios' | 'none'

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  const mode: InstallMode = isStandalone() ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none'

  const install = async () => {
    if (!deferred) return false
    const ev = deferred
    await ev.prompt()
    const { outcome } = await ev.userChoice
    deferred = null
    notify()
    return outcome === 'accepted'
  }

  return { mode, install }
}
