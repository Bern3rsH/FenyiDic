const assert = require('assert')
const { execFile } = require('child_process')
const { lstat, readdir, realpath } = require('fs/promises')
const { extname, join } = require('path')
const { promisify } = require('util')
const { signAsync } = require('@electron/osx-sign')

const execFileAsync = promisify(execFile)

const AD_HOC_IDENTITY = '-'
const CODESIGN_VERBOSE_LEVEL = '4'
const SIGNABLE_BUNDLE_EXTENSIONS = new Set(['.app', '.framework'])
const SIGNABLE_FILE_EXTENSIONS = new Set(['.dylib', '.node', '.so'])
const RUNTIME_SIGNATURE_FLAGS_PATTERN = /^CodeDirectory .* flags=.*\([^)]*\bruntime\b[^)]*\)$/m

function getSigningOptionsForFile() {
  return {
    hardenedRuntime: false
  }
}

function isSignableBundlePath(filePath) {
  return SIGNABLE_BUNDLE_EXTENSIONS.has(extname(filePath))
}

function isSignableFilePath(filePath) {
  return SIGNABLE_FILE_EXTENSIONS.has(extname(filePath))
}

function hasExecutableMode(stats) {
  return (stats.mode & 0o111) !== 0
}

async function isMachOFile(filePath) {
  try {
    const { stdout } = await execFileAsync('file', ['-b', filePath])
    return stdout.includes('Mach-O')
  } catch {
    return false
  }
}

async function collectSignablePaths(rootPath) {
  const signablePaths = []
  const visitedRealPaths = new Set()

  async function visit(filePath) {
    const stats = await lstat(filePath)
    if (stats.isSymbolicLink()) {
      return
    }

    const resolvedPath = await realpath(filePath)
    if (visitedRealPaths.has(resolvedPath)) {
      return
    }
    visitedRealPaths.add(resolvedPath)

    if (stats.isDirectory()) {
      const isBundle = isSignableBundlePath(filePath)
      const children = await readdir(filePath)
      for (const child of children) {
        await visit(join(filePath, child))
      }
      if (isBundle) {
        signablePaths.push(filePath)
      }
      return
    }

    if (
      stats.isFile() &&
      (isSignableFilePath(filePath) || hasExecutableMode(stats)) &&
      await isMachOFile(filePath)
    ) {
      signablePaths.push(filePath)
    }
  }

  await visit(rootPath)

  return signablePaths.sort((left, right) => right.length - left.length)
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

async function resynchronizeLegacyAdHocSignature(codePath) {
  await execFileAsync('codesign', [
    '--force',
    '--sign',
    AD_HOC_IDENTITY,
    codePath
  ])
}

async function resynchronizeLegacyAdHocSignatures(appPath) {
  const signablePaths = await collectSignablePaths(appPath)
  assert(signablePaths.includes(appPath), 'macOS app bundle must be included in signing pass')

  for (const signablePath of signablePaths) {
    await resynchronizeLegacyAdHocSignature(signablePath)
  }
}

async function verifyCodeSignature(codePath) {
  const signatureDetails = await readCodeSignature(codePath)
  assert(
    signatureDetails.includes('Signature=adhoc'),
    `${codePath} must be ad-hoc signed`
  )
  assert(
    !RUNTIME_SIGNATURE_FLAGS_PATTERN.test(signatureDetails),
    `${codePath} must not enable hardened runtime`
  )
}

async function verifyCompleteAdHocSignature(appPath) {
  await execFileAsync('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appPath
  ])

  const signablePaths = await collectSignablePaths(appPath)
  assert(signablePaths.includes(appPath), 'macOS app bundle must be included in verification pass')
  for (const signablePath of signablePaths) {
    await verifyCodeSignature(signablePath)
  }

  const signatureDetails = await readCodeSignature(appPath)
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
    hardenedRuntime: false,
    optionsForFile: getSigningOptionsForFile,
    preAutoEntitlements: false
  })
  await resynchronizeLegacyAdHocSignatures(appPath)

  await verifyCompleteAdHocSignature(appPath)
}

module.exports = sign
module.exports.sign = sign
