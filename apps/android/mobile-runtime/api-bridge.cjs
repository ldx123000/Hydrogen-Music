const http = require('node:http')

function createApiBridge(ncmPort) {
  return http.createServer((req, res) => {
    const origin = req.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    // Credentialed requests require explicit headers; '*' does not allow JSON POSTs.
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type')
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
    res.setHeader('Access-Control-Expose-Headers', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const headers = { ...req.headers, host: `127.0.0.1:${ncmPort}` }
    const proxyReq = http.request(
      { hostname: '127.0.0.1', port: ncmPort, path: req.url, method: req.method, headers },
      proxyRes => {
        const responseHeaders = { ...proxyRes.headers }
        if (responseHeaders['set-cookie']) {
          const list = Array.isArray(responseHeaders['set-cookie'])
            ? responseHeaders['set-cookie']
            : [responseHeaders['set-cookie']]
          responseHeaders['set-cookie'] = list.map(cookie => String(cookie)
            .replace(/;\s*domain=[^;]*/gi, '')
            .replace(/;\s*secure/gi, ''))
        }
        res.writeHead(proxyRes.statusCode || 502, responseHeaders)
        proxyRes.pipe(res)
      }
    )

    proxyReq.on('error', error => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      res.end(JSON.stringify({ code: 502, message: `API 不可达: ${error.message}` }))
    })

    req.pipe(proxyReq)
  })
}

module.exports = { createApiBridge }
