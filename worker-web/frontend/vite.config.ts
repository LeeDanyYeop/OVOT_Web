import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const backend = process.env.OVOT_BACKEND ?? 'http://127.0.0.1:8100'

// `npm run dev:https` serves over self-signed HTTPS on the LAN for phone testing
// (Web NFC and camera access require a secure context).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  // Field phones include older Safari, Samsung Internet and in-app browsers; lower the syntax.
  build: { target: ['es2019', 'chrome79', 'safari13', 'edge88', 'firefox78'] },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': backend,
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
}))
