#!/usr/bin/env node

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')
const FEEDBACK_EMAIL = 'bern3rsh+fenyidic@gmail.com'

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')

const sharedTypesSource = readProjectFile('src/shared/types.ts')
const mainSource = readProjectFile('src/main/index.ts')
const preloadSource = readProjectFile('src/preload/index.ts')
const settingsSource = readProjectFile('src/renderer/components/Settings.tsx')
const localizationSource = readProjectFile('src/renderer/localization.tsx')

assert(
  sharedTypesSource.includes(`export const APP_FEEDBACK_EMAIL = '${FEEDBACK_EMAIL}'`),
  'shared feedback email must use the configured Gmail alias'
)
assert(
  sharedTypesSource.includes("OPEN_FEEDBACK_EMAIL: 'feedback:openEmail'"),
  'feedback email IPC channel must be declared'
)
assert(
  mainSource.includes('const FEEDBACK_EMAIL_URL = `mailto:${APP_FEEDBACK_EMAIL}?subject='),
  'main process must construct a fixed mailto URL from the shared email constant'
)
assert(
  mainSource.includes('await shell.openExternal(FEEDBACK_EMAIL_URL)'),
  'main process must open the feedback address with the system email client'
)
assert(
  mainSource.includes('ipcMain.handle(IPC_CHANNELS.OPEN_FEEDBACK_EMAIL, () => openFeedbackEmail())'),
  'main process must register the feedback email IPC handler'
)
assert(
  preloadSource.includes('openFeedbackEmail: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FEEDBACK_EMAIL)'),
  'preload must expose the fixed feedback email action'
)
assert(
  settingsSource.includes('const result = await window.api.openFeedbackEmail()'),
  'general settings must invoke the feedback email action'
)
assert(
  settingsSource.includes('{APP_FEEDBACK_EMAIL}'),
  'general settings must display the feedback email address'
)

for (const messageKey of [
  'settingsFeedbackTitle',
  'settingsFeedbackSubtitle',
  'settingsFeedbackEmailAction',
  'settingsFeedbackEmailError'
]) {
  const occurrenceCount = localizationSource.split(`${messageKey}:`).length - 1
  assert.equal(occurrenceCount, 2, `${messageKey} must be defined for both supported locales`)
}

console.log('feedback email assertions passed')
