/**
 * Script to rebuild better-sqlite3 for Electron's ABI
 *
 * On Windows, the generated .vcxproj files may reference a Windows SDK
 * version that is not installed. This script:
 * 1. Runs node-gyp configure with Electron headers
 * 2. Patches the .vcxproj files to use the installed SDK version
 * 3. Runs node-gyp build
 *
 * Usage: npx tsx scripts/rebuild-native.ts
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BETTER_SQLITE3_DIR = path.join(ROOT, 'node_modules', 'better-sqlite3')

// Read Electron version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const electronVersion = pkg.devDependencies?.electron?.replace(/^\^/, '')

if (!electronVersion) {
  console.error('[Rebuild] Could not determine Electron version from package.json')
  process.exit(1)
}

console.log(`[Rebuild] Rebuilding better-sqlite3 for Electron ${electronVersion}...`)

// Step 1: Configure with Electron headers
console.log('[Rebuild] Step 1: Running node-gyp configure...')
execSync('npx node-gyp configure --msvs_version=2022', {
  cwd: BETTER_SQLITE3_DIR,
  env: {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_build_from_source: 'true',
  },
  stdio: 'inherit',
})

// Step 2: Patch Windows SDK version in .vcxproj files
console.log('[Rebuild] Step 2: Patching Windows SDK version...')

// Detect installed SDK version
let installedSdk = '10.0.19041.0' // Default fallback
try {
  const sdkDirs = fs.readdirSync('C:\\Program Files (x86)\\Windows Kits\\10\\Include', { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('10.'))
    .map(d => d.name)
    .sort()
  if (sdkDirs.length > 0) {
    installedSdk = sdkDirs[0] // Use the oldest (most compatible) version
    console.log(`[Rebuild] Found installed SDK: ${installedSdk}`)
  }
} catch {
  console.warn('[Rebuild] Could not detect installed SDK, using fallback: 10.0.19041.0')
}

const buildDir = path.join(BETTER_SQLITE3_DIR, 'build')
const vcxprojFiles = [
  path.join(buildDir, 'better_sqlite3.vcxproj'),
  path.join(buildDir, 'test_extension.vcxproj'),
]

for (const file of vcxprojFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8')
    // Replace any WindowsTargetPlatformVersion with the installed version
    content = content.replace(
      /<WindowsTargetPlatformVersion>[\d.]+<\/WindowsTargetPlatformVersion>/g,
      `<WindowsTargetPlatformVersion>${installedSdk}</WindowsTargetPlatformVersion>`,
    )
    fs.writeFileSync(file, content, 'utf-8')
    console.log(`[Rebuild] Patched: ${path.basename(file)}`)
  }
}

// Step 3: Build
console.log('[Rebuild] Step 3: Running node-gyp build...')
execSync('npx node-gyp build --msvs_version=2022', {
  cwd: BETTER_SQLITE3_DIR,
  env: process.env,
  stdio: 'inherit',
})

console.log('[Rebuild] better-sqlite3 rebuilt successfully for Electron!')
