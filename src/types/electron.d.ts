/**
 * Type declarations for the Electron preload API
 * exposed via contextBridge to the renderer process.
 */

export interface ElectronAPI {
  /** Get the app version */
  getVersion(): Promise<string>
  /** Get the app data directory path */
  getAppPath(): Promise<string>
  /** Open an external URL in the default browser */
  openExternal(url: string): Promise<void>
  /** Check if this is the first run (no database exists) */
  isFirstRun(): Promise<boolean>
  /** Get an environment variable value */
  getEnv(key: string): Promise<string | null>
  /** Set an environment variable value (in memory) */
  setEnv(key: string, value: string): Promise<void>
  /** Persist environment variables to disk */
  saveEnv(): Promise<void>
  /** Initialize the database (run migrations) */
  initDatabase(): Promise<boolean>
  /** Minimize the application window */
  minimizeWindow(): Promise<void>
  /** Maximize or restore the application window */
  maximizeWindow(): Promise<void>
  /** Close the application window */
  closeWindow(): Promise<void>
  /** Listen for the app-ready event */
  onAppReady(callback: () => void): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
