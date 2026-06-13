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

function patchLoopbackClientIpForwarding() {
  if (!fs.existsSync(serverTarget)) return

  let source = fs.readFileSync(serverTarget, 'utf8')

  const helperMarker = 'function normalizeForwardedClientIp(value) {'
  if (!source.includes(helperMarker)) {
    const insertBefore = 'function createConsoleSpinner(message = \'启动中\') {'
    const helper = `function normalizeForwardedClientIp(value) {
  let ip = String(value || '').trim()
  if (!ip) return ''
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === 'localhost') return ''
  if (/^127(?:\\.|$)/.test(ip)) return ''
  return ip
}

`

    if (!source.includes(insertBefore)) {
      console.warn('[patch-ncm-api] client IP helper insertion point not found')
      return
    }
    source = source.replace(insertBefore, `${helper}${insertBefore}`)
  }

  const oldIpBlock = `          // 参数注入客户端IP
          const obj = [...params]
          const options = obj[2] || {}
          let ip = ''

          if (options.randomCNIP) {
            ip = global.cnIp
            // logger.info('Using random Chinese IP for request:', ip)
          } else {
            ip = req.ip

            if (ip.substring(0, 7) == '::ffff:') {
              ip = ip.substring(7)
            }
            if (ip == '::1') {
              ip = global.cnIp
            }
            // logger.info('Requested from ip:', ip)
          }

          obj[2] = {
            ...options,
            ip,
          }
`

  const newIpBlock = `          // 参数注入客户端IP；本地回环地址不能作为真实 IP 继续透传给网易云。
          const obj = [...params]
          const options = obj[2] || {}
          const ip = options.randomCNIP ? (global.cnIp || '') : normalizeForwardedClientIp(req.ip)
          const nextOptions = { ...options }

          if (ip) nextOptions.ip = ip
          else delete nextOptions.ip

          obj[2] = nextOptions
`

  if (source.includes(oldIpBlock)) {
    source = source.replace(oldIpBlock, newIpBlock)
  } else if (!source.includes('normalizeForwardedClientIp(req.ip)')) {
    console.warn('[patch-ncm-api] client IP forwarding block not found')
  }

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
patchLoopbackClientIpForwarding()
patchRequestSuccessLog()
patchDotenvQuiet()

console.log(changed
  ? '[patch-ncm-api] dependency patches applied'
  : '[patch-ncm-api] dependency patches already applied')
