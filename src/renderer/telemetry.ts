import * as Sentry from '@sentry/electron/renderer'
import type { TelemetryEventName, TelemetryEventProperties } from '../shared/types'

let sentryRendererInitialized = false

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
  const rawValue = getOptionalEnvValue(import.meta.env.VITE_TELEMETRY_DISABLED).toLowerCase()
  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes'
}

export function initializeRendererTelemetry(windowName: string): void {
  if (sentryRendererInitialized || isTelemetryDisabled()) {
    return
  }

  const sentryDsn = getOptionalEnvValue(import.meta.env.VITE_SENTRY_DSN)
  if (!sentryDsn) {
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    tracesSampleRate: 0,
    beforeSend(event) {
      event.tags = {
        ...event.tags,
        window: windowName
      }
      return event
    }
  })
  Sentry.setTag('window', windowName)
  sentryRendererInitialized = true
}

export function captureTelemetryEvent(
  eventName: TelemetryEventName,
  properties: TelemetryEventProperties = {}
): void {
  try {
    window.api.captureTelemetryEvent(eventName, properties)
  } catch (error) {
    console.warn('[Telemetry] Failed to send renderer event:', error)
  }
}
