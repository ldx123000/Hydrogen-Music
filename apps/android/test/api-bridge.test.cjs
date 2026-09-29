const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { createApiBridge } = require('../mobile-runtime/api-bridge.cjs')

async function listen(server, t) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => {
    server.close(resolve)
    server.closeAllConnections()
  }))
  return server.address().port
}

test('credentialed JSON login requests pass preflight and preserve API responses', async t => {
  const received = []
  const upstreamPort = await listen(http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    received.push({ method: req.method, url: req.url, body: JSON.parse(body) })
    res.setHeader('Content-Type', 'application/json')
    if (req.url.startsWith('/captcha/sent')) {
      res.end(JSON.stringify({ code: 200, data: true }))
    } else {
      res.writeHead(400)
      res.end(JSON.stringify({ code: 502, message: '验证码错误' }))
    }
  }), t)
  const bridgePort = await listen(createApiBridge(upstreamPort), t)
  const base = `http://127.0.0.1:${bridgePort}`
  const origin = 'https://localhost'

  for (const endpoint of ['/captcha/sent', '/login/cellphone']) {
    const response = await fetch(base + endpoint, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-requested-with',
      },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.ok(response.headers.get('access-control-allow-methods').split(',').includes('POST'))
    const allowed = response.headers.get('access-control-allow-headers').toLowerCase().split(/,\s*/)
    assert.ok(allowed.includes('content-type'), 'JSON Content-Type must be allowed explicitly for credentialed requests')
    assert.ok(allowed.includes('x-requested-with'))
  }
  assert.equal(received.length, 0, 'Preflight must not send an SMS or attempt login upstream')

  const phone = { phone: '00000000000', countrycode: '86', ctcode: '86' }
  const sent = await fetch(base + '/captcha/sent?timestamp=1', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(phone),
  })
  assert.equal(sent.headers.get('access-control-allow-origin'), origin)
  assert.equal(sent.headers.get('access-control-allow-credentials'), 'true')
  assert.deepEqual(await sent.json(), { code: 200, data: true })
  assert.deepEqual(received[0], { method: 'POST', url: '/captcha/sent?timestamp=1', body: phone })

  const login = { phone: phone.phone, countrycode: '86', captcha: '000000' }
  const rejected = await fetch(base + '/login/cellphone', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(login),
  })
  assert.equal(rejected.status, 400)
  assert.equal(rejected.headers.get('access-control-allow-origin'), origin)
  assert.deepEqual(await rejected.json(), { code: 502, message: '验证码错误' })
  assert.deepEqual(received[1].body, login)
})

test('upstream failures remain readable from a credentialed WebView request', async t => {
  const unavailable = http.createServer()
  unavailable.listen(0, '127.0.0.1')
  await once(unavailable, 'listening')
  const port = unavailable.address().port
  await new Promise(resolve => unavailable.close(resolve))
  const bridgePort = await listen(createApiBridge(port), t)
  const result = await fetch(`http://127.0.0.1:${bridgePort}/login/cellphone`, {
    method: 'POST', headers: { Origin: 'https://localhost', 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(result.status, 502)
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://localhost')
  assert.equal(result.headers.get('access-control-allow-credentials'), 'true')
  assert.equal((await result.json()).code, 502)
})

test('playlist query parameters and multipart uploads reach the API unchanged', async t => {
  const received = []
  const upstreamPort = await listen(http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    received.push({ url: req.url, type: req.headers['content-type'], body: Buffer.concat(chunks).toString() })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ code: 200 }))
  }), t)
  const bridgePort = await listen(createApiBridge(upstreamPort), t)
  const base = `http://127.0.0.1:${bridgePort}`
  const playlistUrl = '/playlist/tracks?op=add&pid=1&tracks=2'
  await fetch(base + playlistUrl, { method: 'POST', headers: { Origin: 'https://localhost' } })
  assert.equal(received[0].url, playlistUrl)

  const form = new FormData()
  form.append('songFile', new Blob(['test-audio-content'], { type: 'audio/mpeg' }), 'test.mp3')
  const result = await fetch(base + '/cloud', { method: 'POST', headers: { Origin: 'https://localhost' }, body: form })
  assert.equal(result.status, 200)
  assert.match(received[1].type, /^multipart\/form-data; boundary=/)
  assert.match(received[1].body, /name="songFile"; filename="test.mp3"/)
  assert.match(received[1].body, /test-audio-content/)
})
