import './runtime-environment'
import { app, shell, BrowserWindow, screen, ipcMain, Menu, autoUpdater as nativeAutoUpdater } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './database'
import { registerIpcHandlers } from './ipc/handlers'
import { initMdd } from './services/mdd-service'

import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { IPC_CHANNELS } from '../shared/types'
import type {
  AppUpdateCheckResult,
  AppUpdateDownloadResult,
  AppUpdateInfo,
  AppUpdateInstallResult,
  AppUpdateProgress
} from '../shared/types'

// 配置自动更新日志
autoUpdater.logger = console
autoUpdater.autoDownload = false
autoUpdater.fullChangelog = false

const GITHUB_EMPTY_RELEASE_NOTES_TEXT = 'No content.'
const MACOS_AUTO_UPDATE_SIGNING_REQUIREMENT_MESSAGE =
  'macOS 自动更新要求应用使用有效签名；当前构建可能未签名，请下载新版 DMG 手动安装。'
const UPDATE_INSTALL_START_TIMEOUT_MS = 60_000

let manualUpdateCheckPromise: Promise<AppUpdateCheckResult> | null = null
let manualUpdateDownloadPromise: Promise<AppUpdateDownloadResult> | null = null
let lastAvailableUpdateInfo: AppUpdateInfo | null = null
let lastDownloadedUpdateInfo: AppUpdateInfo | null = null
let isInstallingDownloadedUpdate = false
let hasStartedUpdateQuit = false

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return '未知错误'
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (typeof releaseNotes === 'string') {
    const trimmedReleaseNotes = releaseNotes.trim()
    return trimmedReleaseNotes && trimmedReleaseNotes !== GITHUB_EMPTY_RELEASE_NOTES_TEXT ? trimmedReleaseNotes : null
  }

  if (Array.isArray(releaseNotes)) {
    const normalizedNotes = releaseNotes
      .map(({ version, note }) => [version, note].filter(Boolean).join('\n'))
      .map((note) => note.trim())
      .filter((note) => note.length > 0)
      .filter((note) => note !== GITHUB_EMPTY_RELEASE_NOTES_TEXT)

    return normalizedNotes.length > 0 ? normalizedNotes.join('\n\n') : null
  }

  return null
}

function normalizeUpdateInfo(info: UpdateInfo): AppUpdateInfo {
  return {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate ?? null
  }
}

function normalizeUpdateProgress(progressInfo: ProgressInfo): AppUpdateProgress {
  return {
    percent: Number.isFinite(progressInfo.percent) ? progressInfo.percent : 0,
    transferred: Number.isFinite(progressInfo.transferred) ? progressInfo.transferred : 0,
    total: Number.isFinite(progressInfo.total) ? progressInfo.total : 0,
    bytesPerSecond: Number.isFinite(progressInfo.bytesPerSecond) ? progressInfo.bytesPerSecond : 0
  }
}

function sendToMainWindow(channel: string, payload: unknown): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
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
        lastAvailableUpdateInfo = null
        lastDownloadedUpdateInfo = null
        return {
          status: 'not-available',
          currentVersion,
          updateInfo: updateInfo ? normalizeUpdateInfo(updateInfo) : undefined
        }
      }

      const updateInfo = normalizeUpdateInfo(updateCheckResult.updateInfo)
      lastAvailableUpdateInfo = updateInfo
      lastDownloadedUpdateInfo = null

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

async function downloadManualAppUpdate(): Promise<AppUpdateDownloadResult> {
  if (!app.isPackaged) {
    return {
      success: false,
      error: '开发环境不支持下载安装更新，请打包安装后再测试。'
    }
  }

  if (manualUpdateDownloadPromise) {
    return manualUpdateDownloadPromise
  }

  manualUpdateDownloadPromise = (async () => {
    try {
      console.log('[Update] Downloading update by user action...')
      await autoUpdater.downloadUpdate()
      if (!lastDownloadedUpdateInfo && lastAvailableUpdateInfo) {
        lastDownloadedUpdateInfo = lastAvailableUpdateInfo
      }

      return {
        success: true,
        updateInfo: lastDownloadedUpdateInfo ?? lastAvailableUpdateInfo ?? undefined
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error('[Update] Failed to download update:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      manualUpdateDownloadPromise = null
    }
  })()

  return manualUpdateDownloadPromise
}

function getUpdateInstallStartTimeoutMessage(): string {
  if (process.platform === 'darwin') {
    return `未能启动自动安装。${MACOS_AUTO_UPDATE_SIGNING_REQUIREMENT_MESSAGE}`
  }

  return '未能启动自动安装，请稍后再试。'
}

function getUpdateInstallErrorMessage(error: unknown): string {
  const errorMessage = getErrorMessage(error)

  if (process.platform !== 'darwin') {
    return errorMessage
  }

  return `${errorMessage}\n\n${MACOS_AUTO_UPDATE_SIGNING_REQUIREMENT_MESSAGE}`
}

function waitForUpdateInstallStart(): Promise<AppUpdateInstallResult> {
  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let isSettled = false

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      nativeAutoUpdater.off('before-quit-for-update', handleBeforeQuitForUpdate)
      app.off('before-quit', handleBeforeQuit)
      autoUpdater.off('error', handleUpdateError)
    }

    const finish = (result: AppUpdateInstallResult) => {
      if (isSettled) {
        return
      }

      isSettled = true
      cleanup()
      if (!result.success) {
        isInstallingDownloadedUpdate = false
        hasStartedUpdateQuit = false
      }
      resolve(result)
    }

    const handleBeforeQuitForUpdate = () => {
      hasStartedUpdateQuit = true
      finish({ success: true })
    }

    const handleBeforeQuit = () => {
      if (isInstallingDownloadedUpdate) {
        hasStartedUpdateQuit = true
        finish({ success: true })
      }
    }

    const handleUpdateError = (error: Error) => {
      finish({
        success: false,
        error: getUpdateInstallErrorMessage(error)
      })
    }

    nativeAutoUpdater.once('before-quit-for-update', handleBeforeQuitForUpdate)
    app.once('before-quit', handleBeforeQuit)
    autoUpdater.once('error', handleUpdateError)
    timeoutId = setTimeout(() => {
      finish({
        success: false,
        error: getUpdateInstallStartTimeoutMessage()
      })
    }, UPDATE_INSTALL_START_TIMEOUT_MS)
  })
}

async function installDownloadedAppUpdate(): Promise<AppUpdateInstallResult> {
  if (!app.isPackaged) {
    return {
      success: false,
      error: '开发环境不支持安装更新。'
    }
  }

  if (!lastDownloadedUpdateInfo) {
    return {
      success: false,
      error: '更新包尚未下载完成。'
    }
  }

  if (isInstallingDownloadedUpdate) {
    return { success: true }
  }

  try {
    isInstallingDownloadedUpdate = true
    hasStartedUpdateQuit = false
    console.log('[Update] Starting downloaded update install...')
    const installStartPromise = waitForUpdateInstallStart()
    autoUpdater.quitAndInstall(false, true)
    return await installStartPromise
  } catch (error) {
    isInstallingDownloadedUpdate = false
    hasStartedUpdateQuit = false
    const errorMessage = getUpdateInstallErrorMessage(error)
    console.error('[Update] Failed to start update install:', errorMessage)
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

function configureApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const applicationMenuTemplate: MenuItemConstructorOptions[] = [
    {
      label: app.name,
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
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate))
}

autoUpdater.on('update-available', (info) => {
  lastAvailableUpdateInfo = normalizeUpdateInfo(info)
  lastDownloadedUpdateInfo = null
})

autoUpdater.on('download-progress', (progressInfo) => {
  sendToMainWindow(IPC_CHANNELS.APP_UPDATE_DOWNLOAD_PROGRESS, normalizeUpdateProgress(progressInfo))
})

autoUpdater.on('update-downloaded', (info) => {
  lastDownloadedUpdateInfo = normalizeUpdateInfo(info)
})

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err)
  isInstallingDownloadedUpdate = false
  hasStartedUpdateQuit = false
})

nativeAutoUpdater.on('before-quit-for-update', () => {
  hasStartedUpdateQuit = true
  console.log('[Update] App is quitting for update install.')
})

app.on('before-quit', () => {
  if (isInstallingDownloadedUpdate) {
    hasStartedUpdateQuit = true
    console.log('[Update] App quit started during update install.')
  }
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

  if (reviewWindow && !reviewWindow.isDestroyed()) {
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  reviewWindow.on('closed', () => {
    reviewWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    reviewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/review.html`)
  } else {
    reviewWindow.loadFile(join(__dirname, '../renderer/review.html'))
  }
}

function createReadingWindow(anchorWindow?: BrowserWindow): void {
  const targetBounds = getCenteredWindowBounds(READING_WINDOW_WIDTH, READING_WINDOW_HEIGHT, anchorWindow)

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
    title: '辅助精读法阅读',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  readingWindow.on('closed', () => {
    readingWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    readingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/reading.html`)
  } else {
    readingWindow.loadFile(join(__dirname, '../renderer/reading.html'))
  }
}

function createWindow(): void {
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 当页面内容完全加载后，处理待处理的深层链接
  mainWindow.webContents.on('did-finish-load', () => {
    isMainWindowReady = true
    processPendingDeepLink()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_APP_UPDATE, () => downloadManualAppUpdate())
    ipcMain.handle(IPC_CHANNELS.INSTALL_APP_UPDATE, () => installDownloadedAppUpdate())

    console.log('Creating window...')
    createWindow()
    console.log('Window created.')
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
