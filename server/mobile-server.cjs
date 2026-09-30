#!/usr/bin/env node
/**
 * Hydrogen Music 移动端服务
 *
 * 把原本只跑在 Electron 主进程里的两块能力搬到独立进程，让手机通过局域网访问：
 *   1. 内置增强版网易云 API（复用 src/electron/services.js，纯 Node，不依赖 Electron）
 *   2. 前端构建产物静态托管
 *
 * 两者挂在同一个源上，于是：
 *   - 没有跨域问题，axios 的 withCredentials 正常生效
 *   - 前端只需请求相对路径 /api/*，不用关心手机访问的具体地址
 *
 * 用法：node server/mobile-server.cjs
 *       npm run mobile
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DIST_DIR = path.resolve(__dirname, '..', 'dist')
const NCM_API_PORT = Number(process.env.HM_NCM_PORT || 36530)
const WEB_PORT = Number(process.env.HM_WEB_PORT || 8080)

// 复用 Electron 主进程里的 API 启动逻辑：它是纯 Node 模块，不依赖 Electron
let startNeteaseMusicApi = null
try {
  startNeteaseMusicApi = require('../src/electron/services.js')
} catch (error) {
  console.error('[mobile] 加载网易云 API 模块失败:', error.message)
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
}

// ---------------------------------------------------------------- 静态资源

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const stream = fs.createReadStream(filePath)

  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    })
    stream.pipe(res)
  })

  stream.on('error', () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  })
}

function serveStatic(req, res) {
  let pathname = '/'
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch (_) {
    pathname = '/'
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html'

  // 防目录穿越：规范化后必须仍在 dist 内
  const resolved = path.resolve(DIST_DIR, '.' + path.normalize(pathname))
  if (!resolved.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  fs.stat(resolved, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, resolved)
      return
    }
    if (!error && stats.isDirectory()) {
      const indexFile = path.join(resolved, 'index.html')
      if (fs.existsSync(indexFile)) {
        sendFile(res, indexFile)
        return
      }
    }
    // 单页应用回退
    sendFile(res, path.join(DIST_DIR, 'index.html'))
  })
}

// ---------------------------------------------------------------- API 代理

function proxyToNcmApi(req, res) {
  const targetPath = req.url.replace(/^\/api/, '') || '/'
  const headers = { ...req.headers }
  headers.host = `127.0.0.1:${NCM_API_PORT}`

  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: NCM_API_PORT, path: targetPath, method: req.method, headers },
    proxyRes => {
      const responseHeaders = { ...proxyRes.headers }
      // 上游 Set-Cookie 的 domain 对手机端无意义，剥掉避免浏览器拒收
      if (responseHeaders['set-cookie']) {
        const cookies = Array.isArray(responseHeaders['set-cookie'])
          ? responseHeaders['set-cookie']
          : [responseHeaders['set-cookie']]
        responseHeaders['set-cookie'] = cookies.map(cookie =>
          String(cookie)
            .replace(/;\s*domain=[^;]*/gi, '')
            .replace(/;\s*secure/gi, '')
        )
      }
      res.writeHead(proxyRes.statusCode || 502, responseHeaders)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', error => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    }
    res.end(JSON.stringify({ code: 502, message: `NCM API 不可达: ${error.message}` }))
  })

  req.pipe(proxyReq)
}

// ---------------------------------------------------------------- 启动

function listLanAddresses() {
  const result = []
  const interfaces = os.networkInterfaces()
  Object.values(interfaces).forEach(addresses => {
    (addresses || []).forEach(address => {
      if (address.family === 'IPv4' && !address.internal) {
        result.push(address.address)
      }
    })
  })
  return result
}

async function main() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('[mobile] 未找到 dist/index.html，请先执行 npm run build')
    process.exit(1)
  }

  console.log('[mobile] 正在启动内置网易云 API...')
  const apiState = await startNeteaseMusicApi()
  if (apiState && apiState.ready) {
    console.log(`[mobile] 网易云 API 就绪 (127.0.0.1:${NCM_API_PORT})`)
  } else {
    console.warn(`[mobile] 网易云 API 启动失败: ${apiState && apiState.error}，接口请求将不可用`)
  }

  const server = http.createServer((req, res) => {
    if (req.url && (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?'))) {
      proxyToNcmApi(req, res)
      return
    }
    serveStatic(req, res)
  })

  server.listen(WEB_PORT, '0.0.0.0', () => {
    const addresses = listLanAddresses()
    console.log('')
    console.log('  Hydrogen Music 移动端已启动')
    console.log('  ─────────────────────────────────────────')
    console.log(`  本机:     http://localhost:${WEB_PORT}`)
    addresses.forEach(address => {
      console.log(`  局域网:   http://${address}:${WEB_PORT}   <- 手机浏览器打开这个`)
    })
    console.log('  ─────────────────────────────────────────')
    console.log('  手机需与本机处于同一 Wi-Fi；若打不开请检查防火墙是否放行该端口')
    console.log('')
  })
}

main().catch(error => {
  console.error('[mobile] 启动失败:', error)
  process.exit(1)
})
