// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    // Vitest 4 threads pool has an initialisation race on Windows — forks is stable
    pool: 'forks',
    // Verbose reporter serialises output across fork processes, preventing garbled results
    reporter: 'verbose',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
