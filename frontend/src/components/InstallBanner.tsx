import { useState } from 'react'
import { useInstallPrompt } from '../lib/install'

const DISMISS_KEY = 'ovot.install.dismissed'

export function InstallBanner() {
  const { mode, install } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (mode === 'none' || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <section className="install-banner" aria-label="앱 설치">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="install-text">
        <strong>OVOT 앱 설치</strong>
        <span>
          {mode === 'prompt'
            ? '홈 화면에 설치하면 앱처럼 바로 열립니다'
            : '공유 버튼 → "홈 화면에 추가"로 설치하세요'}
        </span>
      </div>
      {mode === 'prompt' && (
        <button className="btn btn-primary btn-sm" onClick={() => void install()}>
          설치
        </button>
      )}
      <button className="install-close" aria-label="설치 안내 닫기" onClick={dismiss}>
        ×
      </button>
    </section>
  )
}
