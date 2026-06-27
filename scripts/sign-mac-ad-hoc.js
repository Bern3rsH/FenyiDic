const assert = require('assert')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { signAsync } = require('@electron/osx-sign')

const execFileAsync = promisify(execFile)

const AD_HOC_IDENTITY = '-'
const CODESIGN_VERBOSE_LEVEL = '4'

async function readCodeSignature(appPath) {
  try {
    const { stdout, stderr } = await execFileAsync('codesign', [
      '-dv',
      `--verbose=${CODESIGN_VERBOSE_LEVEL}`,
      appPath
    ])
    return `${stdout}\n${stderr}`
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`.trim()
    if (output.length > 0) {
      return output
    }
    throw error
  }
}

async function verifyCompleteAdHocSignature(appPath) {
  await execFileAsync('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appPath
  ])

  const signatureDetails = await readCodeSignature(appPath)
  assert(
    signatureDetails.includes('Signature=adhoc'),
    'macOS app must be ad-hoc signed'
  )
  assert(
    !signatureDetails.includes('Info.plist=not bound'),
    'macOS app signature must bind Info.plist'
  )
  assert(
    !signatureDetails.includes('Sealed Resources=none'),
    'macOS app signature must seal bundled resources'
  )
}

async function sign(configuration) {
  const appPath = configuration.app
  assert(appPath, 'electron-builder did not provide a macOS app path')

  await signAsync({
    ...configuration,
    identity: AD_HOC_IDENTITY,
    identityValidation: false,
    preAutoEntitlements: false
  })

  await verifyCompleteAdHocSignature(appPath)
}

module.exports = sign
module.exports.sign = sign
