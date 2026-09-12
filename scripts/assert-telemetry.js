const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/main/telemetry.ts'), 'utf8')
const compiled = ts.transpileModule(source.replaceAll('import.meta.env', 'runtimeEnv'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText

async function run({ disabled = false, failure = false, packaged = false } = {}) {
  const requests = []
  const stored = { anonymousInstallId: 'existing-installation' }
  const warnings = []
  const exports = {}
  const context = {
    exports, runtimeEnv: {},
    process: { env: { FENYIDIC_POSTHOG_KEY: 'test-key', FENYIDIC_TELEMETRY_DEBUG: 'true', FENYIDIC_TELEMETRY_DISABLED: String(disabled) }, platform: process.platform, arch: process.arch },
    console: { info() {}, warn(...args) { warnings.push(args) } },
    AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return { app: { isPackaged: packaged, getVersion: () => '1.3.0' } }
      if (name === 'electron-store') return class {
        get(key) { return stored[key] }
        set(key, value) { stored[key] = value }
      }
      if (name === '@sentry/electron/main') return {}
      return require(name)
    },
    fetch(url, init) {
      if (failure) throw new Error('offline')
      requests.push({ url, payload: JSON.parse(init.body) })
      return Promise.resolve({ ok: true, json: async () => ({ status: 1 }) })
    }
  }
  vm.runInNewContext(compiled, context)
  exports.initializeTelemetry()
  exports.captureTelemetryEvent('app_opened', {
    app_name: 'spoofed', app_environment: 'spoofed', distinct_id: 'spoofed',
    $process_person_profile: true, integration_verification: true, nested: { private: true }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(stored.anonymousInstallId, 'existing-installation')
  if (disabled || failure) {
    assert.equal(requests.length, 0)
    assert.equal(warnings.length, failure ? 1 : 0)
    return
  }
  const { url, payload } = requests[0]
  assert.equal(url, 'https://us.i.posthog.com/i/v0/e/')
  assert.equal(payload.api_key, 'test-key')
  assert.equal(payload.distinct_id, 'fenyidic:existing-installation')
  assert.equal(payload.properties.distinct_id, payload.distinct_id)
  assert.equal(payload.properties.app_name, 'FenyiDic')
  assert.equal(payload.properties.app_environment, packaged ? 'production' : 'development')
  assert.equal(payload.properties.$process_person_profile, false)
  assert.equal(payload.properties.nested, undefined)
  return payload
}

async function main() {
  const payload = await run()
  await run({ packaged: true })
  await run({ disabled: true })
  await run({ failure: true })
  console.log('FenyiDic telemetry checks passed: metadata, identity, environments, opt-out, offline.')
  if (process.env.POSTHOG_LIVE_VERIFY === '1') {
    const { loadEnv } = require('vite')
    const env = loadEnv('development', path.join(__dirname, '..'), 'VITE_')
    assert.ok(env.VITE_POSTHOG_KEY)
    payload.api_key = env.VITE_POSTHOG_KEY
    payload.distinct_id = 'fenyidic:verification-' + require('node:crypto').randomUUID()
    payload.properties.distinct_id = payload.distinct_id
    const response = await fetch((env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '') + '/i/v0/e/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(2500)
    })
    assert.ok(response.ok, 'PostHog HTTP ' + response.status)
    const result = await response.json()
    assert.ok(result.status === 1 || result.status === 'Ok')
    console.log('FenyiDic synthetic PostHog event accepted.')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
