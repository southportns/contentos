/**
 * Electron Main Process
 *
 * Responsibilities:
 * 1. Start Next.js production server (or connect to dev server)
 * 2. Create the application window
 * 3. Manage app lifecycle (single instance, auto-start server)
 * 4. Initialize SQLite database on first run
 * 5. Persist user configuration (.env.local equivalent)
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { spawn, ChildProcess, execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// ─── Configuration ──────────────────────────────────────

const isDev = !app.isPackaged
const PORT = 3000
const SERVER_URL = `http://localhost:${PORT}`

// App data directory — persists across updates
const appDataDir = app.getPath('userData')
const envFilePath = path.join(appDataDir, '.env.local')
const dbPath = path.join(appDataDir, 'contentos.db')

/**
 * Resolve the bundled app directory (extraResources/app).
 * In production, this is process.resourcesPath/app.
 * In development, it's the project root.
 */
function getAppDir(): string {
  if (isDev) return process.cwd()
  return path.join(process.resourcesPath, 'app')
}

// ─── Environment Management ─────────────────────────────

interface EnvConfig {
  [key: string]: string
}

/**
 * Load env vars from the persistent .env.local in app data dir.
 * Falls back to the project .env.local in dev.
 */
function loadEnvConfig(): EnvConfig {
  const envPath = isDev
    ? path.join(process.cwd(), '.env.local')
    : envFilePath

  const config: EnvConfig = {}

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      config[key] = value
    }
  }

  return config
}

const envConfig: EnvConfig = loadEnvConfig()

/**
 * Save env config to the persistent file and update process.env
 */
function saveEnvConfig() {
  // Update process.env
  for (const [key, value] of Object.entries(envConfig)) {
    process.env[key] = value
  }

  // Save to file (only in production — in dev, use project .env.local)
  if (!isDev) {
    const lines = Object.entries(envConfig).map(
      ([key, value]) => `${key}=${value}`,
    )
    fs.writeFileSync(envFilePath, lines.join('\n'), 'utf-8')
  }
}

/**
 * Ensure DATABASE_URL points to the persistent SQLite path.
 */
function ensureDatabaseUrl() {
  // Always use the app data directory for the database
  envConfig.DATABASE_URL = `file:${dbPath}`
  process.env.DATABASE_URL = envConfig.DATABASE_URL
}

// ─── Database Initialization ────────────────────────────

/**
 * Initialize the SQLite database.
 * Runs prisma migrate deploy on first run.
 * Uses execFileSync to run prisma CLI synchronously.
 */
function initDatabase(): void {
  ensureDatabaseUrl()

  const appDir = getAppDir()
  const prismaSchemaPath = path.join(appDir, 'prisma', 'schema.prisma')
  const migrationsDir = path.join(appDir, 'prisma', 'migrations')

  console.log('[Main] Database path:', dbPath)
  console.log('[Main] DATABASE_URL:', envConfig.DATABASE_URL)

  // Ensure the app data directory exists
  const appDataParent = path.dirname(dbPath)
  if (!fs.existsSync(appDataParent)) {
    fs.mkdirSync(appDataParent, { recursive: true })
  }

  // Check if database already exists
  const dbExists = fs.existsSync(dbPath)

  if (!dbExists) {
    console.log('[Main] First run — creating SQLite database...')
  }

  // Try to run prisma migrations
  try {
    // Find the prisma binary
    const prismaBin = isDev
      ? path.join(appDir, 'node_modules', '.bin', 'prisma')
      : path.join(appDir, 'node_modules', 'prisma', 'build', 'index.js')

    const env = {
      ...process.env,
      DATABASE_URL: envConfig.DATABASE_URL,
    }

    if (fs.existsSync(migrationsDir) && fs.existsSync(prismaSchemaPath)) {
      console.log('[Main] Running prisma migrate deploy...')
      execFileSync('node', [prismaBin, 'migrate', 'deploy'], {
        cwd: appDir,
        env,
        stdio: 'pipe',
        timeout: 60000,
      })
      console.log('[Main] Database migrations applied successfully')
    } else {
      console.log('[Main] Running prisma db push (no migrations found)...')
      execFileSync('node', [prismaBin, 'db', 'push'], {
        cwd: appDir,
        env,
        stdio: 'pipe',
        timeout: 60000,
      })
      console.log('[Main] Database schema pushed successfully')
    }
  } catch (error) {
    console.error('[Main] Database migration failed:', error)
    // Fallback: try db push
    try {
      const appDir = getAppDir()
      const prismaBin = isDev
        ? path.join(appDir, 'node_modules', '.bin', 'prisma')
        : path.join(appDir, 'node_modules', 'prisma', 'build', 'index.js')

      console.log('[Main] Fallback: running prisma db push...')
      execFileSync('node', [prismaBin, 'db', 'push'], {
        cwd: appDir,
        env: { ...process.env, DATABASE_URL: envConfig.DATABASE_URL },
        stdio: 'pipe',
        timeout: 60000,
      })
      console.log('[Main] Database schema pushed successfully')
    } catch (pushError) {
      console.error('[Main] Database push also failed:', pushError)
      // Don't throw — let the app try to work anyway
      // The user can manually run migrations from Settings
    }
  }
}

// ─── Next.js Server ──────────────────────────────────────

let nextServer: ChildProcess | null = null

/**
 * Start the Next.js production server.
 * In production, spawns `node server.js` from the standalone output.
 * In dev, we assume `next dev` is already running.
 */
function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      console.log('[Main] Dev mode — connecting to existing dev server')
      resolve()
      return
    }

    const appDir = getAppDir()

    // Next.js standalone output has server.js at the root
    const serverPath = path.join(appDir, 'server.js')

    if (!fs.existsSync(serverPath)) {
      console.error('[Main] Next.js standalone server not found at:', serverPath)
      reject(new Error(`Server file not found: ${serverPath}`))
      return
    }

    console.log('[Main] Starting Next.js production server from:', appDir)
    console.log('[Main] Server path:', serverPath)

    nextServer = spawn(process.execPath, [serverPath], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(PORT),
        HOSTNAME: '0.0.0.0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false

    nextServer.stdout?.on('data', (data) => {
      const msg = data.toString()
      console.log('[Next]', msg.trim())
      // Next.js standalone prints "✓ Ready" when ready
      if (!resolved && (msg.includes('Ready') || msg.includes('ready') || msg.includes('started'))) {
        resolved = true
        resolve()
      }
    })

    nextServer.stderr?.on('data', (data) => {
      console.error('[Next Error]', data.toString().trim())
    })

    nextServer.on('exit', (code) => {
      console.log(`[Main] Next.js server exited with code ${code}`)
      nextServer = null
    })

    nextServer.on('error', (err) => {
      console.error('[Main] Failed to start Next.js:', err)
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    // Timeout — resolve anyway after 15s (server may still be starting)
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.log('[Main] Server start timeout — proceeding anyway')
        resolve()
      }
    }, 15000)
  })
}

// ─── Window Management ───────────────────────────────────

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false, // Show when ready-to-show
    title: 'Content OS',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load the Next.js app
  mainWindow.loadURL(SERVER_URL)

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Handle external links — open in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC Handlers ────────────────────────────────────────

function setupIpcHandlers() {
  ipcMain.handle('get-version', () => app.getVersion())

  ipcMain.handle('get-app-path', () => appDataDir)

  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('is-first-run', () => {
    return !fs.existsSync(dbPath)
  })

  ipcMain.handle('get-env', (_event, key: string) => {
    return envConfig[key] || process.env[key] || null
  })

  ipcMain.handle('set-env', (_event, key: string, value: string) => {
    envConfig[key] = value
    process.env[key] = value
  })

  ipcMain.handle('save-env', () => {
    saveEnvConfig()
  })

  ipcMain.handle('init-database', async () => {
    try {
      initDatabase()
      return true
    } catch (error) {
      console.error('[Main] Database init via IPC failed:', error)
      return false
    }
  })

  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('close-window', () => {
    mainWindow?.close()
  })
}

// ─── App Lifecycle ───────────────────────────────────────

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  // Apply env config to process.env
  ensureDatabaseUrl()
  saveEnvConfig()

  // Setup IPC
  setupIpcHandlers()

  // Initialize database
  try {
    initDatabase()
  } catch (error) {
    console.error('[Main] Database initialization error:', error)
    dialog.showErrorBox(
      'Database Error',
      `Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe app will continue but database features may not work.`,
    )
  }

  // Start Next.js server (production only)
  if (!isDev) {
    try {
      await startNextServer()
    } catch (error) {
      console.error('[Main] Failed to start Next.js server:', error)
      dialog.showErrorBox(
        'Server Error',
        `Failed to start the application server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // Wait a moment for the server to be ready (production only)
  if (!isDev) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Create window
  createWindow()

  // Notify renderer that the app is ready
  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('app-ready')
  })
})

app.on('window-all-closed', () => {
  // Kill the Next.js server
  if (nextServer) {
    nextServer.kill()
    nextServer = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill()
    nextServer = null
  }
})
