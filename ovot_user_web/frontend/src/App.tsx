import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AdminPage } from './pages/Admin'
import { TagsPage } from './pages/Tags'
import { WorkerPage } from './pages/Worker'

function SessionGate({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { status, me, error, retry } = useAuth()
  if (status === 'loading') {
    return (
      <div className="splash" role="status">
        서버에 연결 중…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="splash">
        <div className="stack" style={{ maxWidth: 360, padding: 16, textAlign: 'center' }}>
          <p className="alert alert-error" role="alert">
            {error}
          </p>
          <p className="muted">네트워크가 돌아오면 자동으로 다시 연결합니다.</p>
          <button className="btn btn-primary btn-lg" onClick={retry}>
            다시 연결
          </button>
        </div>
      </div>
    )
  }
  if (admin && !me?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <SessionGate>
            <WorkerPage />
          </SessionGate>
        }
      />
      <Route
        path="/admin"
        element={
          <SessionGate admin>
            <AdminPage />
          </SessionGate>
        }
      />
      <Route
        path="/admin/tags"
        element={
          <SessionGate admin>
            <TagsPage />
          </SessionGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
