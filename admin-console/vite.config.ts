import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : 어느 하위 경로에 올려도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
})
