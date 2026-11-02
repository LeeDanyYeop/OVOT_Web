import type React from 'react'
import { useState } from 'react'
import { demoStore } from '../demo/store'
import { USERS, type Role } from '../demo/scenarioB03'
import { saveSite } from './screens/ShipyardMap'
import { GlobeMap, SITES } from './GlobeMap'

const ROLES: Role[] = ['lead', 'designer']
// 생산관리/공무감독 데모 사번 — 1번은 작업자 웹앱의 중공업 현장 담당자 강민철(사번 1005)과 같은 사람
export const LEAD_IDS = [{ id: 'W1', no: '1005', name: '강민철' }, { id: 'W2', no: 'W2', name: '현장 담당자 2' }] as const
export const LEAD_KEY = 'ovot-lead-id'

const ID_STYLE: React.CSSProperties = { appearance: 'none', font: 'inherit', fontWeight: 400, minHeight: 52, padding: '0 44px 0 18px', borderRadius: 14, border: '1px solid #d2d2d7', background: "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%236e6e73' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 18px center", color: '#1d1d1f', cursor: 'pointer' }

export function LoginScreen() {
  const [role, setRole] = useState<Role>('lead')
  const [leadId, setLeadId] = useState<string>(() => { try { return localStorage.getItem(LEAD_KEY) || 'W1' } catch { return 'W1' } })
  const u = USERS[role]
  // 지도에서 고른 조선소. 지금은 관제가 연결된 울산만 로그인할 수 있어서 울산을 기본으로 골라 둔다
  const [yardId, setYardId] = useState<string | null>('ulsan')
  const yard = SITES.find((y) => y.id === yardId) ?? null
  const canLogin = !!yard?.live

  return (
    <div className="cn-login">
      <section className="cn-login-art cn-login-3d cn-login-mapart" aria-label="OVOT 소개">
        {/* 지구본 — 국내·해외 HD현대 사업장 위치 */}
        <div className="cn-login-3d-scene"><GlobeMap selected={yardId} onSelect={setYardId} /></div>
        <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
        <h1 className="cn-login-slogan"><em>O</em>ne Voice, <em>O</em>ne Team, <em>O</em>V<em>O</em>T</h1>
      </section>

      <form
        className="cn-login-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!yard || !canLogin) return
          saveSite(yard.id, '도크1')
          if (role === 'lead') { try { localStorage.setItem(LEAD_KEY, leadId) } catch { /* 저장 불가 시 기본 W1 */ } }
          demoStore.login(role)
        }}
      >
        <h2>관리자 로그인</h2>
        <p className={`cn-login-yard${canLogin ? ' is-ok' : yard ? ' is-off' : ''}`}>
          {!yard ? '지구본이나 아래 목록에서 사업장을 선택하세요' : canLogin ? yard.name : `${yard.name} · 데이터 준비 중이라 아직 로그인할 수 없어요`}
        </p>
        {/* 폰에서는 지구본 핀이 작아 누르기 어려워서 목록으로도 고른다 */}
        <label className="cn-login-yardpick">사업장 선택
          <select value={yardId ?? ''} onChange={(e) => setYardId(e.target.value || null)} style={ID_STYLE}>
            <option value="">사업장을 고르세요</option>
            {SITES.map((y) => <option key={y.id} value={y.id} disabled={!y.live}>{y.name}{y.live ? '' : ' (준비 중)'}</option>)}
          </select>
        </label>
        <fieldset className="cn-login-body" disabled={!canLogin}>

        <fieldset className="cn-roles">
          <legend>역할 선택</legend>
          {ROLES.map((r) => (
            <label key={r} className="cn-role">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <b>{USERS[r].roleLabel}</b>
              <span>{USERS[r].hint}</span>
            </label>
          ))}
        </fieldset>

        {/* 두 역할 모두 같은 모양의 사번 선택 칸 */}
        <label className="cn-field">
          데모 사번
          {role === 'lead' ? (
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={ID_STYLE}>
              {LEAD_IDS.map((l) => (
                <option key={l.id} value={l.id}>{l.no} · {l.name}</option>
              ))}
            </select>
          ) : (
            <select value={u.id} onChange={() => {}} style={ID_STYLE}>
              <option value={u.id}>{u.id} · {u.name}</option>
            </select>
          )}
        </label>

        <button type="submit" className="cn-btn cn-btn-primary cn-btn-lg" disabled={!canLogin}>
          로그인
        </button>
        </fieldset>

      </form>
    </div>
  )
}
