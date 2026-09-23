import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // For component tests requiring DOM, add @vitest-environment jsdom
    // at the top of the test file (e.g., behavior tests with RTL)
  },
  resolve: {
    alias: {
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/skills': path.resolve(__dirname, './skills'),
      '@/app': path.resolve(__dirname, './src/app'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
