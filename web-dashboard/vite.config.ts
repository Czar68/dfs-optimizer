import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // IONOS: Target=/dfs = document root is dfs, so /assets/ resolves to dfs/assets/ (not /dfs/assets/)
base: '/',
  server: { port: 5173 },
})
