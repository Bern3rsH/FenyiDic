const assert = require('assert')
const { execFile } = require('child_process')
const { lstat, readdir, realpath } = require('fs/promises')
const { extname, join } = require('path')
const { promisify } = require('util')
const { signAsync } = require('@electron/osx-sign')

const execFileAsync = promisify(execFile)

const AD_HOC_IDENTITY = '-'
const CODESIGN_VERBOSE_LEVEL = '4'
const ARM64_CODE_SIGNATURE_PAGE_SIZE = '16384'
const DARWIN_APP_ENTITLEMENTS = join(__dirname, '../build/entitlements.mac.plist')
const SIGNABLE_BUNDLE_EXTENSIONS = new Set(['.app', '.framework'])
const SIGNABLE_FILE_EXTENSIONS = new Set(['.dylib', '.node', '.so'])

function getSigningOptionsForFile(filePath) {
  if (filePath.endsWith('.app')) {
    return {
      entitlements: DARWIN_APP_ENTITLEMENTS
    }
  }

  return undefined
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

async function readCodeSignature(codePath) {
  try {
    const { stdout, stderr } = await execFileAsync('codesign', [
      '-dv',
      `--verbose=${CODESIGN_VERBOSE_LEVEL}`,
      codePath
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

async function resynchronizeAdHocSignature(codePath) {
  const codesignArgs = [
    '--force',
    '--sign',
    AD_HOC_IDENTITY,
    '--pagesize',
    ARM64_CODE_SIGNATURE_PAGE_SIZE,
    '--options',
    'runtime'
  ]

  if (codePath.endsWith('.app')) {
    codesignArgs.push('--entitlements', DARWIN_APP_ENTITLEMENTS)
  }

  codesignArgs.push(codePath)
  await execFileAsync('codesign', codesignArgs)
}

async function resynchronizeAdHocSignatures(appPath) {
  const signablePaths = await collectSignablePaths(appPath)
  assert(signablePaths.includes(appPath), 'macOS app bundle must be included in signing pass')

  for (const signablePath of signablePaths) {
    await resynchronizeAdHocSignature(signablePath)
  }
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

async function verifyCodeSignature(codePath) {
  const signatureDetails = await readCodeSignature(codePath)
  assert(
    signatureDetails.includes('Signature=adhoc'),
    `${codePath} must be ad-hoc signed`
  )
  if (signatureDetails.includes('Mach-O thin (arm64)')) {
    assert(
      signatureDetails.includes(`Page size=${ARM64_CODE_SIGNATURE_PAGE_SIZE}`),
      `${codePath} must use page size ${ARM64_CODE_SIGNATURE_PAGE_SIZE}`
    )
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
  await resynchronizeAdHocSignatures(appPath)

  await verifyCompleteAdHocSignature(appPath)
}

module.exports = sign
module.exports.sign = sign
