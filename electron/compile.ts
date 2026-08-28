/**
 * Electron compilation script
 *
 * Compiles TypeScript electron files (main.ts, preload.ts) to JavaScript
 * so that electron-builder can package them.
 *
 * Usage: npx tsx electron/compile.ts
 */

import { build } from 'tsup'
import path from 'node:path'

async function compile() {
  console.log('[Compile] Building Electron main process...')

  await build({
    entry: {
      main: path.resolve('electron/main.ts'),
      preload: path.resolve('electron/preload.ts'),
    },
    outDir: path.resolve('dist-electron'),
    format: ['cjs'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: true,
    // Don't bundle node_modules — they'll be in the app resources
    noExternal: [],
    external: [
      'electron',
      'better-sqlite3',
      '@prisma/client',
      '@prisma/adapter-better-sqlite3',
      'next',
    ],
  })

  console.log('[Compile] Electron build complete → dist-electron/')
}

compile().catch((err) => {
  console.error('[Compile] Failed:', err)
  process.exit(1)
})
