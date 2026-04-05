// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    // Vitest 4 threads pool has a race condition on Windows — forks pool is stable
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
