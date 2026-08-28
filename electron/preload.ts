/**
 * Electron Preload Script
 *
 * Runs in the renderer process before the web page loads.
 * Exposes a minimal API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe subset of IPC to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Get the app data directory path
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Open external URLs in the default browser
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Check if this is the first run
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),

  // Get/set environment configuration
  getEnv: (key: string) => ipcRenderer.invoke('get-env', key),
  setEnv: (key: string, value: string) => ipcRenderer.invoke('set-env', key, value),
  saveEnv: () => ipcRenderer.invoke('save-env'),

  // Database operations
  initDatabase: () => ipcRenderer.invoke('init-database'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // App readiness
  onAppReady: (callback: () => void) => ipcRenderer.on('app-ready', callback),
})
