const fs = require('fs')
const path = require('path')

const utilTarget = path.resolve(
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

const serverTarget = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'server.js',
)

const songUrlV1Target = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'module',
  'song_url_v1.js',
)

if (!fs.existsSync(utilTarget)) {
  console.log('[patch-ncm-api] dependency not installed, skip patch')
  process.exit(0)
}

let changed = false

function writeIfChanged(filePath, nextSource) {
  const currentSource = fs.readFileSync(filePath, 'utf8')
  if (currentSource === nextSource) return false
  fs.writeFileSync(filePath, nextSource, 'utf8')
  changed = true
  return true
}

function patchRandomChineseIp() {
  let source = fs.readFileSync(utilTarget, 'utf8')

  if (!source.includes("generateRandomChineseIP() {\n    return ''")) {
    source = source.replace("const fs = require('fs')\n", '')
    source = source.replace("const path = require('path')\n", '')

    const ipHelpersStart = source.indexOf('// IP地址转换函数')
    const ipHelpersEnd = source.indexOf('const floor = Math.floor', ipHelpersStart)

    if (ipHelpersStart === -1 || ipHelpersEnd === -1) {
      console.warn('[patch-ncm-api] Chinese IP helper block not found, skip random IP patch')
    } else {
      source = source.slice(0, ipHelpersStart) + source.slice(ipHelpersEnd)

      const funcStart = source.indexOf('  generateRandomChineseIP() {')
      const funcEnd = source.indexOf('  },\n  //', funcStart)

      if (funcStart === -1 || funcEnd === -1) {
        console.warn('[patch-ncm-api] generateRandomChineseIP block not found')
      } else {
        const disabledGenerateFn = `  generateRandomChineseIP() {
    return ''
`

        source = source.slice(0, funcStart) + disabledGenerateFn + source.slice(funcEnd)
        writeIfChanged(utilTarget, source)
      }
    }
  }

  if (fs.existsSync(requestTarget)) {
    const requestSource = fs
      .readFileSync(requestTarget, 'utf8')
      .replace('  generateRandomChineseIP,\n', '')
    writeIfChanged(requestTarget, requestSource)
  }
}

function patchRequestSuccessLog() {
  if (!fs.existsSync(serverTarget)) return

  let source = fs.readFileSync(serverTarget, 'utf8')
  const successLogLine = '        logger.info(`Request Success: ${decode(req.originalUrl)}`)\n'
  if (source.includes(successLogLine)) return

  const marker = '          return request(...obj)\n        })\n'
  if (!source.includes(marker)) {
    console.warn('[patch-ncm-api] request success log insertion point not found')
    return
  }

  source = source.replace(marker, `${marker}${successLogLine}`)
  writeIfChanged(serverTarget, source)
}

function patchDotenvQuiet() {
  for (const filePath of [serverTarget, songUrlV1Target]) {
    if (!fs.existsSync(filePath)) continue
    const source = fs
      .readFileSync(filePath, 'utf8')
      .replaceAll("require('dotenv').config()", "require('dotenv').config({ quiet: true })")
    writeIfChanged(filePath, source)
  }
}

patchRandomChineseIp()
patchRequestSuccessLog()
patchDotenvQuiet()

console.log(changed
  ? '[patch-ncm-api] dependency patches applied'
  : '[patch-ncm-api] dependency patches already applied')
