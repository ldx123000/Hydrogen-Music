#!/usr/bin/env node
// Adapted from 1CYcat1's device-cdp.cjs in PR #64.
// Forward the app's WebView with adb first; see apps/android/README.md.
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const port = Number(process.env.HM_DEVICE_CDP_PORT || 9222)
  const expressionFile = process.argv[2] || path.join(__dirname, 'inspect-page.js')
  const expression = fs.readFileSync(expressionFile, 'utf8')
  const response = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`读取 WebView 调试目标失败（HTTP ${response.status}）`)
  const targets = await response.json()
  const page = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
  if (!page) throw new Error('没有可调试的 WebView；请打开 debug 版应用，并检查 adb 端口转发')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let timer
  let evaluation
  try {
    evaluation = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('WebView 执行超时（10 秒）')), 10000)
      ws.addEventListener('error', () => reject(new Error('WebView 调试连接失败')))
      ws.addEventListener('close', () => reject(new Error('WebView 调试连接已断开')))
      ws.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.id !== 1) return
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      })
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }))
      })
    })
  } finally {
    clearTimeout(timer)
    ws.close()
  }

  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text)
  }
  const result = evaluation.result
  console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2))
}

main().catch(error => {
  console.error('真机检查失败:', error.message)
  process.exitCode = 1
})
