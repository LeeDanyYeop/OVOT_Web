import { useEffect, useState } from 'react'
import { ApiError, NETWORK_MESSAGE, api, type DemoAccount } from '../lib/api'
import { useAuth } from '../lib/auth'

// 관제 로그인과 같은 형식: 역할 선택 → 데모 사번 → 로그인
type Role = 'worker' | 'lead'
const ROLES: { id: Role; title: string; sub: string }[] = [
  { id: 'worker', title: '우진케이', sub: '현장 작업자' },
  { id: 'lead', title: 'HD현대중공업', sub: '작업 지시 · 현장 확인' },
]
// 소속 회사로 나눈다 — 강민철은 협력사(하청) 우진케이 담당자라 김민수와 함께 우진케이에서 고른다
const roleOf = (a: DemoAccount): Role => (a.team.includes('HD현대') ? 'lead' : 'worker')

export function LoginPage() {
  const { login } = useAuth()
  const [accounts, setAccounts] = useState<DemoAccount[]>([])
  const [role, setRole] = useState<Role>('worker')
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.demoAccounts()
      .then((r) => setAccounts(r.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : NETWORK_MESSAGE))
  }, [])
  const list = accounts.filter((a) => roleOf(a) === role)
  useEffect(() => { setPick(list[0]?.id ?? '') }, [role, accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!pick) return
    setBusy(true)
    setError(null)
    try {
      await login(pick)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_MESSAGE)
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <img className="login-logo" src="/logo.png" alt="OVOT" width={92} height={32} />
      <h1 className="login-title">로그인</h1>
      <p className="login-label">역할 선택</p>
      <div className="login-roles" role="radiogroup" aria-label="역할 선택">
        {ROLES.map((r) => (
          <button key={r.id} role="radio" aria-checked={role === r.id} className={`login-role${role === r.id ? ' is-on' : ''}`} onClick={() => setRole(r.id)}>
            <b>{r.title}</b>
            <small>{r.sub}</small>
          </button>
        ))}
      </div>
      <label className="login-label" htmlFor="login-id">데모 사번</label>
      <select id="login-id" className="login-select" value={pick} onChange={(e) => setPick(e.target.value)}>
        {!list.length && <option value="">등록된 계정이 없어요</option>}
        {list.map((a) => <option key={a.id} value={a.id}>{a.employee_number} · {a.name} ({a.role === '현장 담당자' ? '현장 담당자' : a.team})</option>)}
      </select>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <button className="login-submit" disabled={!pick || busy} onClick={() => void submit()}>{busy ? '로그인 중…' : '로그인'}</button>
    </main>
  )
}
