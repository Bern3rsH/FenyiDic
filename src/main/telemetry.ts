import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as Sentry from '@sentry/electron/main'
import Store from 'electron-store'
import type { TelemetryEventName, TelemetryEventProperties } from '../shared/types'

interface TelemetryStoreSchema {
  anonymousInstallId: string
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const TELEMETRY_REQUEST_TIMEOUT_MS = 2500
const POSTHOG_FAILURE_LOG_LIMIT = 1

const telemetryStore = new Store<TelemetryStoreSchema>({
  name: 'telemetry',
  defaults: {
    anonymousInstallId: ''
  }
})

let sentryEnabled = false
let posthogEnabled = false
let posthogKey = ''
let posthogHost = DEFAULT_POSTHOG_HOST
let telemetryInitialized = false
let posthogFailureLogCount = 0

function getOptionalEnvValue(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalizedValue = value?.trim()
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return ''
}

function isTelemetryDisabled(): boolean {
  const rawValue = getOptionalEnvValue(
    process.env.FENYIDIC_TELEMETRY_DISABLED,
    import.meta.env.VITE_TELEMETRY_DISABLED
  ).toLowerCase()

  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes'
}

function isTelemetryDebugEnabled(): boolean {
  const rawValue = getOptionalEnvValue(
    process.env.FENYIDIC_TELEMETRY_DEBUG,
    import.meta.env.VITE_TELEMETRY_DEBUG
  ).toLowerCase()

  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes'
}

function getAnonymousInstallId(): string {
  const existingInstallId = telemetryStore.get('anonymousInstallId')
  if (existingInstallId) {
    return existingInstallId
  }

  const nextInstallId = randomUUID()
  telemetryStore.set('anonymousInstallId', nextInstallId)
  return nextInstallId
}

function getTelemetryEnvironment(): string {
  return app.isPackaged ? 'production' : 'development'
}

function getCommonTelemetryProperties(): TelemetryEventProperties {
  return {
    app_version: app.getVersion(),
    app_environment: getTelemetryEnvironment(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged
  }
}

function sanitizeTelemetryProperties(
  properties: TelemetryEventProperties = {}
): TelemetryEventProperties {
  const sanitizedProperties: TelemetryEventProperties = {}

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitizedProperties[key] = value
    }
  }

  return sanitizedProperties
}

function normalizePostHogHost(rawHost: string): string {
  const normalizedHost = rawHost.trim().replace(/\/+$/, '')
  return normalizedHost || DEFAULT_POSTHOG_HOST
}

function logPostHogFailure(message: string, error?: unknown): void {
  if (!isTelemetryDebugEnabled()) {
    return
  }

  if (posthogFailureLogCount >= POSTHOG_FAILURE_LOG_LIMIT) {
    return
  }

  posthogFailureLogCount += 1
  if (error) {
    console.warn(message, error)
  } else {
    console.warn(message)
  }
}

export function initializeTelemetry(): void {
  if (telemetryInitialized) {
    return
  }

  telemetryInitialized = true

  if (isTelemetryDisabled()) {
    console.info('[Telemetry] Disabled by environment.')
    return
  }

  const sentryDsn = getOptionalEnvValue(
    process.env.FENYIDIC_SENTRY_DSN,
    import.meta.env.VITE_SENTRY_DSN
  )
  posthogKey = getOptionalEnvValue(
    process.env.FENYIDIC_POSTHOG_KEY,
    import.meta.env.VITE_POSTHOG_KEY
  )
  posthogHost = normalizePostHogHost(
    getOptionalEnvValue(
      process.env.FENYIDIC_POSTHOG_HOST,
      import.meta.env.VITE_POSTHOG_HOST
    ) || DEFAULT_POSTHOG_HOST
  )

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      release: `fenyidic@${app.getVersion()}`,
      environment: getTelemetryEnvironment(),
      tracesSampleRate: 0,
      beforeSend(event) {
        event.user = { id: getAnonymousInstallId() }
        event.tags = {
          ...event.tags,
          platform: process.platform,
          arch: process.arch,
          packaged: String(app.isPackaged)
        }
        return event
      }
    })
    Sentry.setUser({ id: getAnonymousInstallId() })
    Sentry.setTag('app_version', app.getVersion())
    sentryEnabled = true
  }

  posthogEnabled = Boolean(posthogKey)

  console.info(
    `[Telemetry] Sentry ${sentryEnabled ? 'enabled' : 'disabled'}, PostHog ${posthogEnabled ? 'enabled' : 'disabled'}.`
  )
}

export function captureTelemetryEvent(
  eventName: TelemetryEventName,
  properties: TelemetryEventProperties = {}
): void {
  const sanitizedProperties = {
    ...getCommonTelemetryProperties(),
    ...sanitizeTelemetryProperties(properties)
  }

  if (sentryEnabled) {
    Sentry.addBreadcrumb({
      category: 'telemetry',
      message: eventName,
      level: 'info',
      data: sanitizedProperties
    })
  }

  if (!posthogEnabled) {
    return
  }

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), TELEMETRY_REQUEST_TIMEOUT_MS)

  fetch(`${posthogHost}/capture/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      api_key: posthogKey,
      event: eventName,
      distinct_id: getAnonymousInstallId(),
      properties: sanitizedProperties
    }),
    signal: abortController.signal
  })
    .catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        logPostHogFailure('[Telemetry] PostHog capture timed out.')
        return
      }
      logPostHogFailure('[Telemetry] PostHog capture failed:', error)
    })
    .finally(() => {
      clearTimeout(timeoutId)
    })
}
