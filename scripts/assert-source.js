#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

function printUsage() {
  console.log(`Usage:
  node scripts/assert-source.js <spec.json>
  node scripts/assert-source.js --stdin < spec.json>
  node scripts/assert-source.js --self-test

Spec format:
{
  "checks": [
    {
      "name": "reading lookup keeps expand silent",
      "file": "src/renderer/ReadingApp.tsx",
      "scope": {
        "start": "{isLookupWordDetailsExpanded && (",
        "end": "<div className=\\"mt-3 rounded-2xl"
      },
      "contains": "autoPlay={false}",
      "notContains": "autoPlay={readingAutoPlay}"
    },
    {
      "name": "abbreviation is sorted before definitions",
      "file": "src/renderer/ReadingApp.tsx",
      "ordered": ["abbreviation 缩写", "definitions 释义"]
    }
  ]
}`)
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function readJsonSpecFromArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return null
  }

  if (args.includes('--stdin')) {
    const rawSpec = fs.readFileSync(0, 'utf8')
    return JSON.parse(rawSpec)
  }

  const specPath = args.find((arg) => !arg.startsWith('--'))
  if (!specPath) {
    throw new Error('Missing spec path. Use --help for usage.')
  }

  const resolvedSpecPath = path.resolve(process.cwd(), specPath)
  return JSON.parse(fs.readFileSync(resolvedSpecPath, 'utf8'))
}

function readCheckSource(check) {
  const files = check.files || (check.file ? [check.file] : [])
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`Check "${check.name || '(unnamed)'}" must define file or files.`)
  }

  return files
    .map((filePath) => {
      const resolvedFilePath = path.resolve(process.cwd(), filePath)
      return fs.readFileSync(resolvedFilePath, 'utf8')
    })
    .join('\n')
}

function applyScope(source, scope, checkName) {
  if (!scope) {
    return source
  }

  const startIndex = scope.start ? source.indexOf(scope.start) : 0
  if (startIndex < 0) {
    throw new Error(`Check "${checkName}" scope start was not found: ${scope.start}`)
  }

  const contentStartIndex = scope.includeStart === false ? startIndex + scope.start.length : startIndex
  const endSearchStartIndex = scope.start ? startIndex + scope.start.length : 0
  const endIndex = scope.end ? source.indexOf(scope.end, endSearchStartIndex) : source.length
  if (endIndex < 0) {
    throw new Error(`Check "${checkName}" scope end was not found: ${scope.end}`)
  }

  return source.slice(contentStartIndex, scope.includeEnd === true ? endIndex + scope.end.length : endIndex)
}

function asArray(value) {
  if (value === undefined) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function toRegExp(value) {
  if (typeof value === 'string') {
    return new RegExp(value)
  }

  if (value && typeof value.pattern === 'string') {
    return new RegExp(value.pattern, value.flags || '')
  }

  throw new Error('Regex assertion must be a string or { pattern, flags } object.')
}

function assertContains(source, expectedValues, checkName, failures) {
  for (const expectedValue of asArray(expectedValues)) {
    if (!source.includes(expectedValue)) {
      failures.push(`missing text in "${checkName}": ${expectedValue}`)
    }
  }
}

function assertNotContains(source, forbiddenValues, checkName, failures) {
  for (const forbiddenValue of asArray(forbiddenValues)) {
    if (source.includes(forbiddenValue)) {
      failures.push(`forbidden text in "${checkName}": ${forbiddenValue}`)
    }
  }
}

function assertRegex(source, regexValues, checkName, failures) {
  for (const regexValue of asArray(regexValues)) {
    const regex = toRegExp(regexValue)
    if (!regex.test(source)) {
      failures.push(`regex did not match in "${checkName}": ${regex}`)
    }
  }
}

function assertNotRegex(source, regexValues, checkName, failures) {
  for (const regexValue of asArray(regexValues)) {
    const regex = toRegExp(regexValue)
    if (regex.test(source)) {
      failures.push(`forbidden regex matched in "${checkName}": ${regex}`)
    }
  }
}

function assertOrdered(source, orderedValues, checkName, failures) {
  if (!orderedValues) {
    return
  }

  if (!Array.isArray(orderedValues) || orderedValues.length < 2) {
    failures.push(`ordered assertion in "${checkName}" must contain at least two strings`)
    return
  }

  let previousIndex = -1
  for (const value of orderedValues) {
    const currentIndex = source.indexOf(value, previousIndex + 1)
    if (currentIndex < 0) {
      failures.push(`ordered text was not found in "${checkName}": ${value}`)
      return
    }

    if (currentIndex <= previousIndex) {
      failures.push(`ordered text is out of order in "${checkName}": ${value}`)
      return
    }

    previousIndex = currentIndex
  }
}

function countMatches(source, countSpec) {
  if (typeof countSpec.text === 'string') {
    if (countSpec.text === '') {
      throw new Error('count.text cannot be empty.')
    }

    let count = 0
    let searchIndex = 0
    while (searchIndex < source.length) {
      const nextIndex = source.indexOf(countSpec.text, searchIndex)
      if (nextIndex < 0) {
        break
      }

      count += 1
      searchIndex = nextIndex + countSpec.text.length
    }
    return count
  }

  if (countSpec.regex) {
    const regex = toRegExp(
      typeof countSpec.regex === 'string'
        ? { pattern: countSpec.regex, flags: 'g' }
        : { ...countSpec.regex, flags: countSpec.regex.flags?.includes('g') ? countSpec.regex.flags : `${countSpec.regex.flags || ''}g` }
    )
    return Array.from(source.matchAll(regex)).length
  }

  throw new Error('count assertion must define text or regex.')
}

function assertCount(source, countSpec, checkName, failures) {
  if (!countSpec) {
    return
  }

  const actualCount = countMatches(source, countSpec)
  if (Number.isInteger(countSpec.exactly) && actualCount !== countSpec.exactly) {
    failures.push(`count mismatch in "${checkName}": expected exactly ${countSpec.exactly}, got ${actualCount}`)
  }

  if (Number.isInteger(countSpec.atLeast) && actualCount < countSpec.atLeast) {
    failures.push(`count mismatch in "${checkName}": expected at least ${countSpec.atLeast}, got ${actualCount}`)
  }

  if (Number.isInteger(countSpec.atMost) && actualCount > countSpec.atMost) {
    failures.push(`count mismatch in "${checkName}": expected at most ${countSpec.atMost}, got ${actualCount}`)
  }
}

function runChecks(spec) {
  if (!spec || !Array.isArray(spec.checks)) {
    throw new Error('Spec must define a checks array.')
  }

  const failures = []
  for (const check of spec.checks) {
    const checkName = check.name || '(unnamed)'
    const source = applyScope(readCheckSource(check), check.scope, checkName)

    assertContains(source, check.contains, checkName, failures)
    assertNotContains(source, check.notContains, checkName, failures)
    assertRegex(source, check.regex, checkName, failures)
    assertNotRegex(source, check.notRegex, checkName, failures)
    assertOrdered(source, check.ordered, checkName, failures)
    assertCount(source, check.count, checkName, failures)

    if (!failures.some((failure) => failure.includes(`"${checkName}"`))) {
      console.log(`✓ ${checkName}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Source assertions failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  }

  console.log(`All ${spec.checks.length} source assertion check(s) passed.`)
}

function runSelfTest() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-source-'))
  const samplePath = path.join(tempDirectory, 'sample.ts')
  fs.writeFileSync(
    samplePath,
    [
      'const first = "alpha"',
      'const second = "beta"',
      'const tooltip = "data-action-tooltip"',
      'const anotherTooltip = "data-action-tooltip"',
      'function block() {',
      '  return "autoPlay={false}"',
      '}'
    ].join('\n')
  )

  runChecks({
    checks: [
      {
        name: 'contains text',
        file: samplePath,
        contains: 'alpha',
        notContains: 'gamma'
      },
      {
        name: 'ordered text',
        file: samplePath,
        ordered: ['alpha', 'beta']
      },
      {
        name: 'regex and count',
        file: samplePath,
        regex: { pattern: 'const\\s+tooltip' },
        count: {
          text: 'data-action-tooltip',
          exactly: 2
        }
      },
      {
        name: 'scoped contains',
        file: samplePath,
        scope: {
          start: 'function block()',
          end: '}',
          includeEnd: true
        },
        contains: 'autoPlay={false}',
        notContains: 'data-action-tooltip'
      }
    ]
  })

  let negativeCheckFailed = false
  try {
    runChecks({
      checks: [
        {
          name: 'expected negative check',
          file: samplePath,
          contains: 'missing text'
        }
      ]
    })
  } catch {
    negativeCheckFailed = true
  }

  if (!negativeCheckFailed) {
    throw new Error('Self-test failed: negative check unexpectedly passed.')
  }

  fs.rmSync(tempDirectory, { recursive: true, force: true })
}

try {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    runSelfTest()
  } else {
    const spec = readJsonSpecFromArgs(args)
    if (spec) {
      runChecks(spec)
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
