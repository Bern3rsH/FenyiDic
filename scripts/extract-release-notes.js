#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const releaseNotesPath = path.join(projectRoot, 'release-notes.md')
const packageJsonPath = path.join(projectRoot, 'package.json')

function getArgValue(flag) {
  const flagIndex = process.argv.indexOf(flag)
  if (flagIndex === -1) {
    return null
  }

  return process.argv[flagIndex + 1] || null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const releaseVersion = getArgValue('--version') || packageJson.version
const outputPath = getArgValue('--output')

if (!releaseVersion) {
  fail('Cannot extract release notes because package.json has no version.')
}

const releaseNotesContent = fs.readFileSync(releaseNotesPath, 'utf8')
const versionHeadingPattern = new RegExp(`^##\\s+v?${escapeRegExp(releaseVersion)}(?:\\s|$).*`, 'im')
const versionHeadingMatch = releaseNotesContent.match(versionHeadingPattern)

if (!versionHeadingMatch || versionHeadingMatch.index === undefined) {
  fail(`Missing release notes section for v${releaseVersion} in release-notes.md.`)
}

const sectionStartIndex = versionHeadingMatch.index + versionHeadingMatch[0].length
const remainingContent = releaseNotesContent.slice(sectionStartIndex)
const nextVersionHeadingMatch = remainingContent.match(/^##\s+/m)
const releaseNotes = (nextVersionHeadingMatch
  ? remainingContent.slice(0, nextVersionHeadingMatch.index)
  : remainingContent
).trim()

if (!releaseNotes) {
  fail(`Release notes section for v${releaseVersion} is empty in release-notes.md.`)
}

if (outputPath) {
  fs.writeFileSync(outputPath, `${releaseNotes}\n`)
} else {
  console.log(releaseNotes)
}
