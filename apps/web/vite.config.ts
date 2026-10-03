import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  envPrefix: ['VITE_', 'SEED_'],
  server: { port: 5173 },
  test: { exclude: [...configDefaults.exclude, 'tests/e2e/**'], environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], css: false },
})
