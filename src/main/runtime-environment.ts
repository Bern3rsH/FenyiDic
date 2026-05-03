import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export type RuntimeEnvironment = 'development' | 'production'

const DEVELOPMENT_USER_DATA_DIR_NAME = 'fenyidic-dev'
const DEVELOPMENT_ENV_VALUES = new Set(['dev', 'development'])

function resolveRuntimeEnvironment(): RuntimeEnvironment {
  const rawRuntimeEnvironment = process.env.FENYIDIC_RUNTIME_ENV?.trim().toLowerCase()

  if (rawRuntimeEnvironment && DEVELOPMENT_ENV_VALUES.has(rawRuntimeEnvironment)) {
    return 'development'
  }

  return is.dev ? 'development' : 'production'
}

export const runtimeEnvironment = resolveRuntimeEnvironment()

if (runtimeEnvironment === 'development') {
  const developmentUserDataPath = join(app.getPath('appData'), DEVELOPMENT_USER_DATA_DIR_NAME)
  app.setPath('userData', developmentUserDataPath)
  console.log('[Runtime] Using development userData path:', developmentUserDataPath)
}
