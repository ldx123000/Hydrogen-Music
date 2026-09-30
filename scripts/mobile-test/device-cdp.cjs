#!/usr/bin/env node
/**
 * 真机 WebView 测量驱动
 *
 * 通过 adb 把设备上的 WebView 调试端口转发到本机，再用 CDP 直接在**真机页面**里
 * 执行一段 JS 并取回结果。相比截图，DOM 几何数值更适合做"居中了没""有没有被遮挡"
 * 这类判断，而且不需要看图。
 *
 * 前置（capacitor.config.json 里已开 webContentsDebuggingEnabled）：
 *   adb shell cat /proc/net/unix | grep webview_devtools_remote
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 * 用法: node device-cdp.cjs <包含表达式的文件>
 *   表达式文件内容应当是 `(async () => { ... })()` 形式，返回值会被打印。
 */
const fs = require('fs')

const PORT = Number(process.env.HM_DEVICE_CDP_PORT || 9222)

async function main() {
    const expressionFile = process.argv[2]
    if (!expressionFile) {
        console.error('用法: node device-cdp.cjs <表达式文件>')
        process.exit(1)
    }
    const expression = fs.readFileSync(expressionFile, 'utf8')

    const listRes = await fetch(`http://127.0.0.1:${PORT}/json`)
    const targets = await listRes.json()
    const page = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    if (!page) {
        console.error('没有找到可调试的页面，实际目标：')
        console.error(JSON.stringify(targets, null, 2))
        process.exit(1)
    }
    console.log(`已连接目标: ${page.title} (${page.url})`)

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve)
        ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')))
    })

    let nextId = 1
    const pending = new Map()
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id)
            pending.delete(message.id)
            if (message.error) reject(new Error(JSON.stringify(message.error)))
            else resolve(message.result)
        }
    })
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })

    await send('Runtime.enable')
    const evaluation = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        allowUnsafeEvalBlockedByCSP: true,
    })

    const result = evaluation.result || {}
    if (result.subtype === 'error' || evaluation.exceptionDetails) {
        console.error('页面内执行异常:')
        console.error(JSON.stringify(evaluation.exceptionDetails || result, null, 2))
    } else {
        console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2))
    }

    ws.close()
}

main().catch(error => {
    console.error('失败:', error && error.message)
    process.exit(1)
})
