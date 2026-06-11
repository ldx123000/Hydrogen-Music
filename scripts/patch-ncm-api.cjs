const fs = require('fs')
const path = require('path')

const target = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'util',
  'index.js',
)

const requestTarget = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'util',
  'request.js',
)

if (!fs.existsSync(target)) {
  console.log('[patch-ncm-api] dependency not installed, skip patch')
  process.exit(0)
}

let source = fs.readFileSync(target, 'utf8')

if (source.includes("generateRandomChineseIP() {\n    return ''")) {
  console.log('[patch-ncm-api] random Chinese IP feature already disabled')
  process.exit(0)
}

source = source.replace("const fs = require('fs')\n", '')
source = source.replace("const path = require('path')\n", '')

const ipHelpersStart = source.indexOf('// IP地址转换函数')
const ipHelpersEnd = source.indexOf('const floor = Math.floor', ipHelpersStart)

if (ipHelpersStart === -1 || ipHelpersEnd === -1) {
  console.warn('[patch-ncm-api] Chinese IP helper block not found, skip patch')
  process.exit(0)
}

source = source.slice(0, ipHelpersStart) + source.slice(ipHelpersEnd)

const funcStart = source.indexOf('  generateRandomChineseIP() {')
const funcEnd = source.indexOf('  },\n  //', funcStart)

if (funcStart === -1 || funcEnd === -1) {
  console.warn('[patch-ncm-api] generateRandomChineseIP block not found')
  process.exit(0)
}

const disabledGenerateFn = `  generateRandomChineseIP() {
    return ''
`

source = source.slice(0, funcStart) + disabledGenerateFn + source.slice(funcEnd)

fs.writeFileSync(target, source, 'utf8')

if (fs.existsSync(requestTarget)) {
  let requestSource = fs.readFileSync(requestTarget, 'utf8')
  requestSource = requestSource.replace('  generateRandomChineseIP,\n', '')
  fs.writeFileSync(requestTarget, requestSource, 'utf8')
}

console.log('[patch-ncm-api] random Chinese IP feature disabled')
