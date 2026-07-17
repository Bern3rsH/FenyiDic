#!/usr/bin/env node

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')
const RENDERER_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer')
const EXPECTED_LUCIDE_VERSION = '1.25.0'

const readProjectFile = (relativePath) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')

const collectTsxFiles = (directoryPath) =>
  fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      return collectTsxFiles(entryPath)
    }
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : []
  })

const packageJson = JSON.parse(readProjectFile('package.json'))
assert.equal(
  packageJson.dependencies?.['lucide-react'],
  EXPECTED_LUCIDE_VERSION,
  'lucide-react must remain pinned to the reviewed version'
)

const rendererSource = collectTsxFiles(RENDERER_ROOT)
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n')

assert.doesNotMatch(
  rendererSource,
  /<svg(?:\s|>)/,
  'renderer components must use Lucide instead of handwritten SVG markup'
)

const forbiddenHandwrittenIcons = [
  ['speaker', /M15\.536 8\.464/],
  ['play triangle', /M8 5v14l11-7z/],
  ['outline checkmark', /M5 13l4 4L19 7/],
  ['filled checkmark', /M16\.707 5\.293/],
  ['close icon', /M6 18L18 6M6 6l12 12/],
  ['font-based information icon', /<span>i<\/span>/]
]

for (const [iconName, iconPattern] of forbiddenHandwrittenIcons) {
  assert.doesNotMatch(
    rendererSource,
    iconPattern,
    `${iconName} must use the shared Lucide icon family`
  )
}

const settingsSource = readProjectFile('src/renderer/components/Settings.tsx')
const sidebarSource = readProjectFile('src/renderer/components/Sidebar.tsx')
const reviewHeaderSource = readProjectFile('src/renderer/components/review/common/ReviewHeader.tsx')
const wordDictationSource = readProjectFile('src/renderer/components/review/word/WordDictationFront.tsx')
const senseDictationSource = readProjectFile('src/renderer/components/review/sense/SenseDictationFront.tsx')
const senseListenSource = readProjectFile('src/renderer/components/review/sense/SenseListenFront.tsx')

assert(settingsSource.includes('<Trash2'), 'settings delete action must use Trash2')
assert(sidebarSource.includes('<Info'), 'CSV information action must use Info')
assert(reviewHeaderSource.includes('<Volume2'), 'review pronunciation controls must use Volume2')
assert(wordDictationSource.includes('<Volume2'), 'word dictation playback must use Volume2')
assert(senseDictationSource.includes('<Volume2'), 'sense dictation playback must use Volume2')
assert(senseListenSource.includes('<RotateCcw'), 'context replay must use RotateCcw')
assert(senseListenSource.includes('<Volume2'), 'word replay must use Volume2')

console.log('icon consistency assertions passed')
