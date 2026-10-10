import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import './lib/install' // capture beforeinstallprompt as early as possible
import './styles.css'

// iOS home-screen apps with a translucent status bar shift the page up by the status bar
// height but keep the old viewport height, leaving an empty strip at the bottom. Measure it
// so full-screen layers can stretch over it (0 everywhere else).
function measureIosGap() {
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  const gap = standalone && window.innerWidth < window.innerHeight ? Math.round(screen.height - window.innerHeight) : 0
  document.documentElement.style.setProperty('--ios-gap', `${gap > 0 && gap < 140 ? gap : 0}px`)
}
measureIosGap()
window.addEventListener('resize', measureIosGap)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
