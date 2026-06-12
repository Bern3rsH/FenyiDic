import './runtime-environment'
import { app, shell, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './database'
import { getStoredAppLanguage, registerIpcHandlers } from './ipc/handlers'
import { initMdd } from './services/mdd-service'

import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import { IPC_CHANNELS } from '../shared/types'
import { normalizeReleaseNotes } from './updateReleaseNotes'
import { captureTelemetryEvent, initializeTelemetry } from './telemetry'
import type {
  AppUpdateCheckResult,
  AppUpdateInfo,
} from '../shared/types'

// 配置自动更新日志
autoUpdater.logger = console
autoUpdater.autoDownload = false
autoUpdater.fullChangelog = false

const APP_DISPLAY_NAME = 'FenyiDic'
const LATEST_RELEASE_PAGE_URL = 'https://github.com/Bern3rsH/FenyiDic/releases/latest'
const REVIEW_WINDOW_TITLES = {
  'zh-CN': '单词复习',
  'en-US': 'Word Review'
} as const
const READING_WINDOW_TITLES = {
  'zh-CN': '辅助精读法阅读',
  'en-US': 'Guided Intensive Reading'
} as const
const STARTUP_LOADING_PAINT_DELAY_MS = 50
const STARTUP_LOADING_TEXT = {
  'zh-CN': {
    status: '应用正在启动',
    message: '正在启动 FenyiDic...'
  },
  'en-US': {
    status: 'App is starting',
    message: 'Starting FenyiDic...'
  }
} as const

app.setName(APP_DISPLAY_NAME)
initializeTelemetry()

let manualUpdateCheckPromise: Promise<AppUpdateCheckResult> | null = null

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return '未知错误'
}

function normalizeUpdateInfo(info: UpdateInfo): AppUpdateInfo {
  return {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes, getStoredAppLanguage()),
    releaseDate: info.releaseDate ?? null
  }
}

async function checkForManualAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = app.getVersion()

  if (!app.isPackaged) {
    return {
      status: 'unsupported',
      currentVersion,
      reason: '开发环境不读取线上更新源，请打包安装后再检查更新。'
    }
  }

  if (manualUpdateCheckPromise) {
    return manualUpdateCheckPromise
  }

  manualUpdateCheckPromise = (async () => {
    try {
      console.log('[Update] Checking for updates by user action...')
      const updateCheckResult = await autoUpdater.checkForUpdates()

      if (!updateCheckResult || !updateCheckResult.isUpdateAvailable) {
        const updateInfo = updateCheckResult?.updateInfo
        return {
          status: 'not-available',
          currentVersion,
          updateInfo: updateInfo ? normalizeUpdateInfo(updateInfo) : undefined
        }
      }

      const updateInfo = normalizeUpdateInfo(updateCheckResult.updateInfo)

      return {
        status: 'available',
        currentVersion,
        updateInfo
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error('[Update] Failed to check for updates:', errorMessage)
      return {
        status: 'error',
        currentVersion,
        error: errorMessage
      }
    } finally {
      manualUpdateCheckPromise = null
    }
  })()

  return manualUpdateCheckPromise
}

async function openLatestReleasePage(): Promise<{ success: boolean; error?: string }> {
  try {
    await shell.openExternal(LATEST_RELEASE_PAGE_URL)
    return { success: true }
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    console.error('[Update] Failed to open latest release page:', errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}

function openRendererAppUpdateCheckDialog(): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
  mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_OPEN_CHECK_DIALOG)
}

function closeFocusedWindow(): void {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return
  }

  focusedWindow.close()
}

function configureApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const applicationMenuTemplate: MenuItemConstructorOptions[] = [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        { role: 'about' },
        {
          label: '检查软件更新…',
          click: openRendererAppUpdateCheckDialog
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: '窗口',
      submenu: [
        {
          label: '关闭窗口',
          accelerator: 'Command+W',
          click: closeFocusedWindow
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate))
}

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err)
})

// 注册协议
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fenyidic', process.execPath, [resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('fenyidic')
}

// 待处理的 URL 队列（用于冷启动场景）
let pendingDeepLinkUrl: string | null = null
let isMainWindowReady = false

// 处理 URL 跳转
function handleUrl(url: string) {
  // fenyidic://apple or fenyidic://search/apple
  // 暂时只支持 fenyidic://<word> 格式
  try {
    const parsed = new URL(url)
    let word = ''
    if (parsed.protocol === 'fenyidic:') {
         const hostname = decodeURIComponent(parsed.hostname)
         const pathname = decodeURIComponent(parsed.pathname)

         // Format: fenyidic://dict/apple
         if (hostname === 'dict') {
             word = pathname.replace(/^\//, '') // Remove leading slash
         } 
         // Fallback/Legacy: fenyidic://apple
         else if (hostname && hostname !== 'localhost') {
             word = hostname
         }
         // Fallback: fenyidic://localhost/apple (some browsers might normalize to this?)
         else if (pathname) {
             word = pathname.replace(/^\//, '')
         }
    }

    if (word) {
      console.log('Deep link navigation:', word)
      const mainWindow = getMainWindow()
      
      if (mainWindow && isMainWindowReady) {
        // 窗口已就绪，直接发送
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        mainWindow.webContents.send('navigate-to-word', word)
      } else {
        // 窗口未就绪，缓存 URL
        console.log('Main window not ready, queuing URL:', url)
        pendingDeepLinkUrl = url
      }
    }
  } catch (e) {
    console.error('Failed to parse URL:', e)
  }
}

// 处理待处理的 URL（在窗口就绪后调用）
function processPendingDeepLink() {
  if (pendingDeepLinkUrl) {
    console.log('Processing pending deep link:', pendingDeepLinkUrl)
    handleUrl(pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }
}

// 复习窗口引用
let reviewWindow: BrowserWindow | null = null
let readingWindow: BrowserWindow | null = null
const REVIEW_WINDOW_WIDTH = 900
const REVIEW_WINDOW_HEIGHT = 780
const READING_WINDOW_WIDTH = 1200
const READING_WINDOW_HEIGHT = 860

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((window) => {
    if (window.isDestroyed()) {
      return false
    }

    return window !== reviewWindow && window !== readingWindow
  })
}

function preserveWindowTitle(window: BrowserWindow, title: string): void {
  window.setTitle(title)
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(title)
  })
}

function configureExternalLinks(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const externalUrl = new URL(url)
      if (externalUrl.protocol === 'https:' || externalUrl.protocol === 'http:') {
        void shell.openExternal(externalUrl.toString()).catch((error) => {
          console.error('Failed to open external link:', error)
        })
      }
    } catch (error) {
      console.error('Invalid external link:', error)
    }

    return { action: 'deny' }
  })
}

function getStartupLoadingDataUrl(): string {
  const startupText = STARTUP_LOADING_TEXT[getStoredAppLanguage()]
  const startupDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_DISPLAY_NAME}</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
      }
      body {
        display: flex;
        cursor: wait;
        user-select: none;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        color: #6b7280;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .startup-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
      .startup-spinner {
        width: 32px;
        height: 32px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 9999px;
        animation: startup-spin 0.8s linear infinite;
      }
      .startup-message {
        font-size: 14px;
        font-weight: 500;
      }
      @keyframes startup-spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main class="startup-loading" role="status" aria-live="polite" aria-label="${startupText.status}">
      <div class="startup-spinner" aria-hidden="true"></div>
      <div class="startup-message">${startupText.message}</div>
    </main>
  </body>
</html>`

  return `data:text/html;charset=UTF-8,${encodeURIComponent(startupDocument)}`
}

function waitForStartupLoadingPaint(): Promise<void> {
  return new Promise((resolvePaint) => {
    setTimeout(resolvePaint, STARTUP_LOADING_PAINT_DELAY_MS)
  })
}

function getCenteredWindowBounds(
  width: number,
  height: number,
  anchorWindow?: BrowserWindow
): { x: number; y: number } {
  const anchorBounds = anchorWindow?.getBounds()
  const targetDisplay = anchorBounds
    ? screen.getDisplayMatching(anchorBounds)
    : screen.getPrimaryDisplay()
  const { workArea } = targetDisplay

  const x = workArea.x + Math.round((workArea.width - width) / 2)
  const y = workArea.y + Math.round((workArea.height - height) / 2)

  return { x, y }
}

// 创建复习窗口
function createReviewWindow(anchorWindow?: BrowserWindow): void {
  const targetBounds = getCenteredWindowBounds(REVIEW_WINDOW_WIDTH, REVIEW_WINDOW_HEIGHT, anchorWindow)
  const windowTitle = REVIEW_WINDOW_TITLES[getStoredAppLanguage()]

  if (reviewWindow && !reviewWindow.isDestroyed()) {
    reviewWindow.setTitle(windowTitle)
    reviewWindow.setPosition(targetBounds.x, targetBounds.y)
    reviewWindow.setSize(REVIEW_WINDOW_WIDTH, REVIEW_WINDOW_HEIGHT)
    reviewWindow.focus()
    return
  }

  reviewWindow = new BrowserWindow({
    x: targetBounds.x,
    y: targetBounds.y,
    width: REVIEW_WINDOW_WIDTH,
    height: REVIEW_WINDOW_HEIGHT,
    minWidth: 900,
    minHeight: 760,
    resizable: true,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: windowTitle,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  preserveWindowTitle(reviewWindow, windowTitle)

  reviewWindow.on('closed', () => {
    reviewWindow = null
  })

  captureTelemetryEvent('window_opened', { window: 'review' })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    reviewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/review.html`)
  } else {
    reviewWindow.loadFile(join(__dirname, '../renderer/review.html'))
  }
}

function createReadingWindow(anchorWindow?: BrowserWindow): void {
  const targetBounds = getCenteredWindowBounds(READING_WINDOW_WIDTH, READING_WINDOW_HEIGHT, anchorWindow)
  const windowTitle = READING_WINDOW_TITLES[getStoredAppLanguage()]

  if (readingWindow && !readingWindow.isDestroyed()) {
    const readingWindowWebContents = readingWindow.webContents

    if (readingWindowWebContents.isDestroyed() || readingWindowWebContents.isCrashed()) {
      readingWindow.destroy()
      readingWindow = null
    } else {
      if (readingWindow.isMinimized()) {
        readingWindow.restore()
      }
      if (!readingWindow.isVisible()) {
        readingWindow.show()
      }

      readingWindow.setPosition(targetBounds.x, targetBounds.y)
      readingWindow.setSize(READING_WINDOW_WIDTH, READING_WINDOW_HEIGHT)
      readingWindow.setTitle(windowTitle)
      readingWindow.moveTop()
      readingWindow.focus()
      return
    }
  }

  if (readingWindow && readingWindow.isDestroyed()) {
    readingWindow = null
  }

  readingWindow = new BrowserWindow({
    x: targetBounds.x,
    y: targetBounds.y,
    width: READING_WINDOW_WIDTH,
    height: READING_WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 720,
    resizable: true,
    minimizable: true,
    maximizable: true,
    autoHideMenuBar: true,
    title: windowTitle,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  preserveWindowTitle(readingWindow, windowTitle)
  configureExternalLinks(readingWindow)

  readingWindow.on('closed', () => {
    readingWindow = null
  })

  captureTelemetryEvent('window_opened', { window: 'reading' })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    readingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/reading.html`)
  } else {
    readingWindow.loadFile(join(__dirname, '../renderer/reading.html'))
  }
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })

  configureExternalLinks(mainWindow)

  captureTelemetryEvent('window_opened', { window: 'main' })

  return mainWindow
}

async function showStartupLoading(mainWindow: BrowserWindow): Promise<void> {
  await mainWindow.loadURL(getStartupLoadingDataUrl())
  if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show()
  }
  await waitForStartupLoadingPaint()
}

async function loadMainRenderer(mainWindow: BrowserWindow): Promise<void> {
  isMainWindowReady = false
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (mainWindow.isDestroyed()) {
    return
  }

  isMainWindowReady = true
  processPendingDeepLink()
}

function createWindow(): void {
  const mainWindow = createMainWindow()
  void loadMainRenderer(mainWindow).catch((error) => {
    console.error('Failed to load main renderer:', error)
  })
}

// macOS Open URL Handler
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleUrl(url)
})

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows/Linux Handler
    // Find dmd:// arg
    const url = commandLine.find(arg => arg.startsWith('fenyidic://'))
    if (url) handleUrl(url)

    // Focus main window
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.fenyidic.dict')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  configureApplicationMenu()

  try {
    console.log('Starting app initialization...')
    console.log('Creating startup window...')
    const mainWindow = createMainWindow()
    await showStartupLoading(mainWindow)
    console.log('Startup loading is visible.')
    
    // 初始化数据库
    console.log('Initializing database...')
    initDatabase()
    console.log('Database initialized.')
    
    // 初始化 MDD 音频资源 (异步，不阻塞启动)
    console.log('Initializing MDD...')
    initMdd().then(() => console.log('MDD initialized.')).catch(err => console.error('Failed to init MDD:', err))

    // 注册 IPC 处理器
    console.log('Registering IPC handlers...')
    registerIpcHandlers()
    
    // 注册复习窗口相关的 IPC 处理器
    ipcMain.handle(IPC_CHANNELS.OPEN_REVIEW_WINDOW, (event) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender) || undefined
      createReviewWindow(sourceWindow)
      return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.OPEN_READING_WINDOW, (event) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender) || undefined
      createReadingWindow(sourceWindow)
      return { success: true }
    })

    ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())
    ipcMain.handle(IPC_CHANNELS.CHECK_APP_UPDATE, () => checkForManualAppUpdate())
    ipcMain.handle(IPC_CHANNELS.OPEN_LATEST_RELEASE_PAGE, () => openLatestReleasePage())

    console.log('Loading main renderer...')
    await loadMainRenderer(mainWindow)
    captureTelemetryEvent('app_opened')
    console.log('Main renderer loaded.')
  } catch (error) {
    console.error('Failed to initialize app:', error)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 导出 autoUpdater 供 IPC 使用
export { autoUpdater }
