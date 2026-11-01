import { useState } from 'react'
import { writeLocalOverrides, type AppConfig, type LocalOverrides, type Mode } from '../config'
import type { SyncState } from '../data/useOvotData'
import { hms } from '../lib/format'
import { Icon } from './ui'

interface Props {
  config: AppConfig
  configFileFound: boolean
  sync: SyncState
  onClose: () => void
  onApply: (next: LocalOverrides) => void
}

export function SettingsSheet({ config, configFileFound, sync, onClose, onApply }: Props) {
  const [mode, setMode] = useState<Mode>(config.mode)
  const [api, setApi] = useState(config.apiBaseUrl)
  const [sec, setSec] = useState(String(Math.round(config.pollIntervalMs / 1000)))

  const apply = () => {
    const next: LocalOverrides = { mode, apiBaseUrl: api.trim().replace(/\/+$/, ''), pollIntervalMs: Math.max(2, Number(sec) || 10) * 1000 }
    writeLocalOverrides(next)
    onApply(next)
  }
  const reset = () => {
    writeLocalOverrides({})
    onApply({})
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="관리자 · 연결 설정" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="panel-title">관리자 · 연결 설정</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <div className="section-label"><span>계정</span></div>
          <dl className="info-rows">
            <div><dt>이름·역할</dt><dd>미연동</dd></div>
            <div><dt>사유</dt><dd>OVOT-Backend 에 로그인·사용자 API 없음</dd></div>
          </dl>

          <div className="section-label"><span>데이터 모드</span></div>
          <div style={{ padding: '0 var(--gutter)' }}>
            <div className="seg" role="group" aria-label="데이터 모드">
              <button aria-pressed={mode === 'live'} onClick={() => setMode('live')}>LIVE · 실제 API</button>
              <button aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>DEMO · 샘플 데이터</button>
            </div>
            <p className="tag" style={{ display: 'block', marginTop: 6 }}>LIVE 연결이 실패해도 DEMO 로 자동 전환하지 않습니다.</p>
          </div>

          <label className="field">
            API 주소 (OVOT-Backend)
            <input className="input mono" value={api} onChange={(e) => setApi(e.target.value)} placeholder="http://localhost:8000" spellCheck={false} />
            <small>브라우저는 이 주소의 FastAPI 만 호출합니다. DB 주소·비밀번호는 입력하지 않습니다. 서버 .env 의 CORS_ORIGINS 에 이 웹사이트 주소가 있어야 합니다.</small>
          </label>
          <label className="field">
            조회 주기 (초)
            <input className="input num" type="number" min={2} max={300} value={sec} onChange={(e) => setSec(e.target.value)} />
            <small>서버에 WebSocket·SSE 가 없어 주기적으로 조회합니다.</small>
          </label>

          <div className="section-label"><span>현재 연결</span></div>
          <dl className="info-rows">
            <div><dt>적용 중인 API</dt><dd className="mono">{config.apiBaseUrl}</dd></div>
            <div><dt>DB</dt><dd>{sync.snapshot?.health.db?.database ?? '—'}</dd></div>
            <div><dt>마지막 성공</dt><dd className="num">{sync.lastSuccessAt ? hms(sync.lastSuccessAt) : '—'}</dd></div>
            <div><dt>연속 실패</dt><dd className="num">{sync.consecutiveFailures}회</dd></div>
            {sync.error && <div><dt>최근 오류</dt><dd style={{ color: '#a1000f' }}>{sync.error}</dd></div>}
            <div><dt>설정 파일</dt><dd>{configFileFound ? 'ovot-config.json 사용' : '없음 · 기본값 사용'}</dd></div>
          </dl>
        </div>
        <div className="sheet-foot">
          <button className="btn" onClick={reset}>파일 설정으로 되돌리기</button>
          <button className="btn btn-primary" onClick={apply}>적용</button>
        </div>
      </aside>
    </div>
  )
}
