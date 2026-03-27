import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  define: {
    __APP_BASE__: JSON.stringify('./'),
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
  resolve: {
    alias: {
      '@repo/canonical-sample-validate': path.resolve(__dirname, '../src/reporting/canonical_sample_artifacts_validate.ts'),
      '@repo/feature-validation-overview-dashboard': path.resolve(
        __dirname,
        '../src/reporting/feature_validation_overview_dashboard.ts'
      ),
      '@repo/validation-reporting-freshness-dashboard': path.resolve(
        __dirname,
        '../src/reporting/validation_reporting_freshness_dashboard.ts'
      ),
      '@repo/live-input-quality-dashboard': path.resolve(__dirname, '../src/reporting/live_input_quality_dashboard.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
}))
