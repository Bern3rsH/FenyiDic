#!/usr/bin/env node

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const MINIMUM_TEXT_CONTRAST = 4.5
const EXPECTED_SETTINGS_INDICATORS = 3

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8')
}

function readLastRgbVariable(cssSource, variableName) {
  const pattern = new RegExp(`--${variableName}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`, 'g')
  const matches = [...cssSource.matchAll(pattern)]
  assert(matches.length > 0, `Missing CSS variable --${variableName}`)
  return matches.at(-1).slice(1).map(Number)
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(firstColor, secondColor) {
  const firstLuminance = relativeLuminance(firstColor)
  const secondLuminance = relativeLuminance(secondColor)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

const cssSource = readSource('src/renderer/styles/index.css')
const settingsSource = readSource('src/renderer/components/Settings.tsx')
const recordingSource = readSource('src/renderer/components/review/word/WordSpeakFront.tsx')

const settingsIndicatorCount = (settingsSource.match(/fd-white-indicator/g) || []).length
assert.strictEqual(
  settingsIndicatorCount,
  EXPECTED_SETTINGS_INDICATORS,
  'Every settings toggle thumb must preserve its white foreground color'
)
assert(
  recordingSource.includes('fd-white-indicator w-8 h-8 bg-white'),
  'The recording stop indicator must preserve its white foreground color'
)
assert(
  /\.fd-white-indicator\s*{\s*background-color:\s*white;\s*}/m.test(cssSource),
  'Dark mode must restore white only for foreground indicators'
)

for (const backgroundName of ['fd-blue-50', 'fd-blue-100']) {
  const contrast = contrastRatio(
    readLastRgbVariable(cssSource, backgroundName),
    readLastRgbVariable(cssSource, 'fd-blue-800')
  )
  assert(
    contrast >= MINIMUM_TEXT_CONTRAST,
    `${backgroundName} and fd-blue-800 contrast ${contrast.toFixed(2)} is below ${MINIMUM_TEXT_CONTRAST}:1`
  )
}

for (const selector of [
  '.bg-blue-50.text-blue-600',
  '.bg-blue-100.text-blue-600',
  '.bg-blue-100.text-blue-700'
]) {
  assert(cssSource.includes(selector), `Missing dark-mode contrast override for ${selector}`)
}

assert(
  cssSource.includes('color: rgb(var(--fd-blue-800) / var(--tw-text-opacity, 1));'),
  'Low-contrast blue text pairs must use the accessible dark-mode foreground'
)

console.log('Dark-mode foreground and contrast assertions passed.')
