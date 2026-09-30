#!/usr/bin/env node
/**
 * 轻量 CDP 测试驱动
 *
 * 系统只有 Edge（Chromium），用它的 DevTools 协议做真实浏览器验证：
 *   - 用手机设备参数模拟视口（390x844, mobile=true 即触摸设备）
 *   - 可在页面加载后注入 JS，用于伪造登录态 / 播放列表，覆盖需要账号才能进的页面
 *   - 收集 console 输出与未捕获异常，白屏类问题一眼可见
 *   - 截图落盘
 *
 * 用法: node cdp.cjs <url> <输出图片名> [注入脚本文件]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const HERE = __dirname
const PROFILE = path.join(HERE, 'cdp-profile')
const PORT = 9333

const [url, outName, setupFile] = process.argv.slice(2)

if (!url || !outName) {
    console.error('用法: node cdp.cjs <url> <输出图片名> [注入脚本文件]')
    process.exit(1)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForTarget(timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
            const targets = await response.json()
            const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
            if (page) return page
        } catch (_) { }
        await sleep(300)
    }
    throw new Error('CDP 未就绪（Edge 可能未启动）')
}

function createClient(ws) {
    let messageId = 0
    const pending = new Map()
    const consoleLogs = []
    const exceptions = []
    const failedRequests = []

    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data)

        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id)
            pending.delete(message.id)
            if (message.error) reject(new Error(JSON.stringify(message.error)))
            else resolve(message.result)
            return
        }

        if (message.method === 'Runtime.consoleAPICalled') {
            const text = (message.params.args || [])
                .map(arg => arg.value ?? arg.description ?? arg.type)
                .join(' ')
            consoleLogs.push(`[${message.params.type}] ${text}`)
        }

        if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails || {}
            exceptions.push(details.exception?.description || details.text || 'unknown exception')
        }

        if (message.method === 'Network.loadingFailed') {
            failedRequests.push(`${message.params.type} ${message.params.errorText}`)
        }
    })

    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++messageId
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })

    return { send, consoleLogs, exceptions, failedRequests }
}

async function main() {
    fs.mkdirSync(HERE, { recursive: true })

    const edge = spawn(EDGE, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${PROFILE}`,
        '--window-size=390,844',
        'about:blank',
    ], { stdio: 'ignore' })

    let exitCode = 0
    try {
        const target = await waitForTarget()
        const ws = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true })
            ws.addEventListener('error', reject, { once: true })
        })

        const client = createClient(ws)
        const { send, consoleLogs, exceptions, failedRequests } = client

        await send('Page.enable')
        await send('Runtime.enable')
        await send('Network.enable')
        // 手机视口 + 触摸设备
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
        })
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

        await send('Page.navigate', { url })
        await sleep(2500)

        // 上一次测试可能留下持久化状态（如 localOnlyMode 会把首页重定向走），先清干净再重载
        await send('Runtime.evaluate', {
            expression: 'try{localStorage.clear();sessionStorage.clear()}catch(_){}',
        })
        await send('Page.reload', {})
        await sleep(4000)

        if (setupFile) {
            const expression = fs.readFileSync(path.resolve(HERE, setupFile), 'utf8')
            const result = await send('Runtime.evaluate', {
                expression,
                awaitPromise: true,
                returnByValue: true,
            })
            if (result.exceptionDetails) {
                console.error('注入脚本执行失败:', result.exceptionDetails.exception?.description)
            } else if (result.result && result.result.value !== undefined) {
                console.log('注入脚本返回:', JSON.stringify(result.result.value))
            }
            await sleep(4000)
        }

        // 触发一次重排，确保截图反映最终布局
        await send('Runtime.evaluate', { expression: 'void document.body.offsetHeight' })

        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const outPath = path.join(HERE, outName.endsWith('.png') ? outName : `${outName}.png`)
        fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'))
        console.log(`截图已保存: ${outPath}`)

        // 页面基本信息
        const info = await send('Runtime.evaluate', {
            expression: `JSON.stringify({
                title: document.title,
                hash: location.hash,
                mobile: document.documentElement.dataset.hmMobile,
                web: document.documentElement.dataset.hmWeb,
                appChildren: document.getElementById('app')?.children.length || 0,
                tabCount: document.querySelectorAll('.hm-tab').length,
                bodyText: (document.body.innerText || '').slice(0, 200)
            })`,
            returnByValue: true,
        })
        console.log('页面状态:', info.result.value)

        if (exceptions.length) {
            console.log(`\n未捕获异常 (${exceptions.length}):`)
            exceptions.slice(0, 10).forEach(item => console.log('  ✗', String(item).split('\n')[0]))
        } else {
            console.log('\n未捕获异常: 无')
        }

        const errors = consoleLogs.filter(line => line.startsWith('[error]'))
        if (errors.length) {
            console.log(`\nconsole.error (${errors.length}):`)
            errors.slice(0, 10).forEach(line => console.log('  !', line.slice(0, 220)))
        }

        if (failedRequests.length) {
            const unique = [...new Set(failedRequests)]
            console.log(`\n失败请求 (${failedRequests.length}):`)
            unique.slice(0, 8).forEach(line => console.log('  !', line))
        }

        ws.close()
    } catch (error) {
        console.error('测试失败:', error.message)
        exitCode = 1
    } finally {
        try { edge.kill() } catch (_) { }
        await sleep(500)
    }
    process.exit(exitCode)
}

main()
