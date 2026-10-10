import type { Mode } from '../config'
import type { SyncState } from '../data/useOvotData'
import { hms } from '../lib/format'
import { Icon } from './ui'

interface Props {
  mode: Mode
  sync: SyncState
  onOpenSettings: () => void
}

export function TopBar({ mode, sync, onOpenSettings }: Props) {
  const conn =
    sync.status === 'loading' && !sync.snapshot
      ? { cls: 'loading', text: '연결 확인 중' }
      : sync.status === 'error'
        ? { cls: 'err', text: sync.error?.startsWith('DB') ? 'DB 연결 오류' : '서버 연결 오류' }
        : { cls: 'ok', text: mode === 'demo' ? '샘플 데이터 정상' : '서버 연결 정상' }

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
        <span className="brand-sub">관리자 관제</span>
        {mode === 'demo' && <span className="demo-chip">DEMO · 샘플 데이터</span>}
      </div>
      <div className="topbar-right">
        <span className={`conn ${conn.cls}`} role="status" aria-live="polite">
          <span className="dot" />
          {conn.text}
          <time title="마지막으로 성공한 갱신 시각">· {sync.lastSuccessAt ? `${hms(sync.lastSuccessAt)} 갱신` : '갱신 전'}</time>
        </span>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={onOpenSettings} aria-label="연결 설정" title="연결 설정">
          <Icon name="settings" />
        </button>
        <button className="tb-btn tb-who" onClick={onOpenSettings} aria-label="관리자 정보">
          <span className="avatar">
            <Icon name="user" />
          </span>
          <span className="tb-who-text">
            <strong>관리자</strong>
            <span>계정 연동 전</span>
          </span>
        </button>
      </div>
    </header>
  )
}
