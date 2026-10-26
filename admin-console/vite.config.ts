import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : 어느 하위 경로에 올려도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react()],
  // /api 는 작업자 서버(8100)로 — DEMO 상태(결정·수신 확인)를 작업자 앱과 공유한다. 서버가 없어도 화면은 동작한다.
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8100' } },
  preview: { port: 4173 },
})
