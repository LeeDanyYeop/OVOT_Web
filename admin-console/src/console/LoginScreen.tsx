import { useState } from 'react'
import { demoStore } from '../demo/store'
import { USERS, type Role } from '../demo/scenarioB03'

const ROLES: Role[] = ['lead', 'designer']

export function LoginScreen() {
  const [role, setRole] = useState<Role>('lead')
  const u = USERS[role]

  return (
    <div className="cn-login">
      <section className="cn-login-art" aria-label="OVOT 소개" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}brand/login-bg.jpg)`, backgroundPosition: "62% center" }}>
        <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
        <h1 className="cn-login-slogan">One Voice, One Team, OVOT</h1>
      </section>

      <form
        className="cn-login-form"
        onSubmit={(e) => {
          e.preventDefault()
          demoStore.login(role)
        }}
      >
        <h2>관리자 로그인</h2>

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

        <label className="cn-field">
          데모 사번
          <input value={u.id} readOnly aria-readonly="true" />
        </label>

        <button type="submit" className="cn-btn cn-btn-primary cn-btn-lg">
          {u.loginLabel}
        </button>

        <p className="cn-login-note">협력사 작업자는 로그인 대신 현장에서 NFC·QR로 체크인합니다 (작업자 PWA).</p>
      </form>
    </div>
  )
}
