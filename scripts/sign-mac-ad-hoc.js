const assert = require('assert')
const { execFile } = require('child_process')
const { join } = require('path')
const { promisify } = require('util')
const { signAsync } = require('@electron/osx-sign')

const execFileAsync = promisify(execFile)

const AD_HOC_IDENTITY = '-'
const CODESIGN_VERBOSE_LEVEL = '4'
const ARM64_CODE_SIGNATURE_PAGE_SIZE = '16384'
const DARWIN_APP_ENTITLEMENTS = join(__dirname, '../build/entitlements.mac.plist')

function getSigningOptionsForFile(filePath) {
  if (filePath.endsWith('.app')) {
    return {
      entitlements: DARWIN_APP_ENTITLEMENTS
    }
  }

  return undefined
}

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

async function resynchronizeAdHocSignature(appPath) {
  await execFileAsync('codesign', [
    '--force',
    '--sign',
    AD_HOC_IDENTITY,
    '--pagesize',
    ARM64_CODE_SIGNATURE_PAGE_SIZE,
    '--options',
    'runtime',
    '--entitlements',
    DARWIN_APP_ENTITLEMENTS,
    appPath
  ])
}

async function readEntitlements(appPath) {
  try {
    const { stdout, stderr } = await execFileAsync('codesign', [
      '-d',
      '--entitlements',
      ':-',
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
  if (signatureDetails.includes('Mach-O thin (arm64)')) {
    assert(
      signatureDetails.includes(`Page size=${ARM64_CODE_SIGNATURE_PAGE_SIZE}`),
      `arm64 macOS app signature must use page size ${ARM64_CODE_SIGNATURE_PAGE_SIZE}`
    )
  }

  const entitlements = await readEntitlements(appPath)
  assert(
    entitlements.includes('com.apple.security.cs.disable-library-validation'),
    'macOS app signature must disable library validation for ad-hoc Electron builds'
  )
}

async function sign(configuration) {
  const appPath = configuration.app
  assert(appPath, 'electron-builder did not provide a macOS app path')

  await signAsync({
    ...configuration,
    identity: AD_HOC_IDENTITY,
    identityValidation: false,
    optionsForFile: getSigningOptionsForFile,
    preAutoEntitlements: false
  })
  await resynchronizeAdHocSignature(appPath)

  await verifyCompleteAdHocSignature(appPath)
}

module.exports = sign
module.exports.sign = sign
