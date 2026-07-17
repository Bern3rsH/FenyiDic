#!/usr/bin/env node

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json')
const REQUIRED_WINDOWS_TARGETS = ['nsis', 'zip', 'portable']
const REQUIRED_WINDOWS_ARCH = ['x64']

const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'))
const windowsTargets = packageJson.build?.win?.target

assert(Array.isArray(windowsTargets), 'build.win.target must be an array')

const targetsByName = new Map(
  windowsTargets.map((targetConfig) => [targetConfig?.target, targetConfig])
)

for (const targetName of REQUIRED_WINDOWS_TARGETS) {
  const targetConfig = targetsByName.get(targetName)
  assert(targetConfig, `missing Windows release target: ${targetName}`)
  assert.deepEqual(
    targetConfig.arch,
    REQUIRED_WINDOWS_ARCH,
    `${targetName} must build only the supported Windows x64 arch`
  )
}

assert.match(
  packageJson.scripts?.['dist:win'] || '',
  /scripts\/build-windows\.js/,
  'dist:win must use the shared Windows build script'
)
assert.match(
  packageJson.scripts?.['release:win'] || '',
  /scripts\/build-windows\.js --publish always/,
  'release:win must publish through the shared Windows build script'
)
assert.equal(packageJson.build?.nsis?.oneClick, false, 'NSIS installer must keep assisted install')
assert.equal(
  packageJson.build?.nsis?.allowToChangeInstallationDirectory,
  true,
  'NSIS installer must allow changing installation directory'
)
assert.equal(
  packageJson.build?.portable?.artifactName,
  '${productName}-${version}-${arch}-portable.${ext}',
  'portable artifact name must not collide with the NSIS installer exe'
)

console.log('windows release target assertions passed')
