#!/usr/bin/env node

const { spawn } = require('child_process')
const { once } = require('events')

function run(command, args) {
  const child = spawn(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit'
  })

  return once(child, 'exit').then(([code, signal]) => {
    if (signal) {
      return 1
    }
    return code || 0
  })
}

async function main() {
  const buildExitCode = await run('electron-builder', [
    '--win',
    '--x64',
    ...process.argv.slice(2)
  ])

  if (process.platform !== 'win32') {
    const restoreExitCode = await run('electron-builder', ['install-app-deps'])
    if (buildExitCode === 0 && restoreExitCode !== 0) {
      process.exit(restoreExitCode)
    }
  }

  process.exit(buildExitCode)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
