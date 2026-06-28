const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const reviewModeSourcePath = path.resolve(__dirname, '../src/renderer/utils/reviewMode.ts')
const reviewModeSource = fs.readFileSync(reviewModeSourcePath, 'utf8')

if (reviewModeSource.includes('听不懂') || reviewModeSource.includes('LEGACY_LISTEN_TAG_ID')) {
  throw new Error('review mode resolver must not infer mode from legacy listening tags')
}

const transpiled = ts.transpileModule(reviewModeSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
})

const sandbox = {
  exports: {},
  require,
  module: { exports: {} }
}
sandbox.module.exports = sandbox.exports

vm.runInNewContext(transpiled.outputText, sandbox, { filename: reviewModeSourcePath })

const { resolveReviewMode } = sandbox.module.exports
const reviewModes = ['read', 'listen', 'speak', 'spell', 'dictation']

for (const reviewMode of reviewModes) {
  const resolvedMode = resolveReviewMode({
    reviewMode,
    tags: [
      { id: 19, name: '听不懂', color: '#3B82F6' },
      { id: 20, name: '不会拼', color: '#3B82F6' }
    ]
  })

  if (resolvedMode !== reviewMode) {
    throw new Error(`expected ${reviewMode}, got ${resolvedMode}`)
  }
}

const unresolvedMode = resolveReviewMode({ tags: [{ id: 19, name: '听不懂', color: '#3B82F6' }] })
if (unresolvedMode !== undefined) {
  throw new Error(`expected undefined for item without reviewMode, got ${unresolvedMode}`)
}

console.log('review mode mapping assertions passed')
