const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

const API_PORT = 36530
const API_READY_TIMEOUT_MS = 12000
const API_READY_POLL_INTERVAL_MS = 150
const API_READY_SETTLE_DELAY_MS = 250

let kugouApiProcess = null
let kugouApiStartupPromise = null

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function getBackendCandidates() {
    return [
        path.join(process.resourcesPath || '', 'KuGouMusicApi'),
        path.resolve(__dirname, '../../../KuGouMusicApi'),
    ].filter((candidate) => candidate && fs.existsSync(candidate))
}

function resolveBackendLaunch() {
    const candidates = getBackendCandidates()
    for (const backendRoot of candidates) {
        if (process.platform === 'win32') {
            const winBinary = path.join(backendRoot, 'bin', 'app_win.exe')
            if (fs.existsSync(winBinary)) {
                return {
                    command: winBinary,
                    args: [],
                    cwd: backendRoot,
                    env: {},
                    label: winBinary,
                }
            }
        }

        const appScript = path.join(backendRoot, 'app.js')
        if (fs.existsSync(appScript)) {
            return {
                command: process.execPath,
                args: [appScript],
                cwd: backendRoot,
                env: {
                    ELECTRON_RUN_AS_NODE: '1',
                },
                label: appScript,
            }
        }
    }

    return null
}

function forwardChildOutput(child) {
    if (child.stdout) {
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString().trim()
            if (text) console.log('[KuGou API]', text)
        })
    }

    if (child.stderr) {
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString().trim()
            if (text) console.error('[KuGou API]', text)
        })
    }
}

function stopKugouMusicApi() {
    if (!kugouApiProcess) return

    const child = kugouApiProcess
    kugouApiProcess = null

    try {
        child.removeAllListeners()
        if (!child.killed) {
            child.kill()
        }
    } catch (_) {}
}

function waitForServerListening(server, timeoutMs = 4000) {
    if (!server || server.listening) return Promise.resolve()

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup()
            reject(new Error('kugou-api-listen-timeout'))
        }, timeoutMs)

        const cleanup = () => {
            clearTimeout(timer)
            server.off('listening', onListening)
            server.off('error', onError)
        }

        const onListening = () => {
            cleanup()
            resolve()
        }

        const onError = (error) => {
            cleanup()
            reject(error)
        }

        server.once('listening', onListening)
        server.once('error', onError)
    })
}

function probeServer(url, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            res.resume()
            resolve(res.statusCode || 200)
        })

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('kugou-api-probe-timeout'))
        })

        req.on('error', reject)
    })
}

async function waitForApiReachable(url, timeoutMs = API_READY_TIMEOUT_MS, intervalMs = API_READY_POLL_INTERVAL_MS) {
    const deadline = Date.now() + timeoutMs
    let lastError = null

    while (Date.now() < deadline) {
        try {
            await probeServer(url)
            return
        } catch (error) {
            lastError = error
            await delay(intervalMs)
        }
    }

    throw lastError || new Error('kugou-api-unreachable')
}

async function startKugouMusicApi() {
    if (kugouApiStartupPromise) {
        return kugouApiStartupPromise
    }

    kugouApiStartupPromise = (async () => {
        const readyUrl = `http://127.0.0.1:${API_PORT}/`

        try {
            await probeServer(readyUrl)
            await delay(API_READY_SETTLE_DELAY_MS)
            return { ready: true, reused: true }
        } catch (_) {}

        const backendLaunch = resolveBackendLaunch()
        if (!backendLaunch) {
            const errorMessage = 'kugou-api-entry-not-found'
            console.log('KuGou API unavailable:', errorMessage)
            return { ready: false, error: errorMessage }
        }

        console.log('KuGou API launch target:', backendLaunch.label)

        const child = spawn(backendLaunch.command, backendLaunch.args, {
            cwd: backendLaunch.cwd,
            env: {
                ...process.env,
                ...backendLaunch.env,
                platform: process.env.platform || 'lite',
                PORT: String(API_PORT),
                HOST: '127.0.0.1',
            },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        kugouApiProcess = child
    console.log('KuGou API process started:', child.pid)
        forwardChildOutput(child)

        child.once('exit', (code, signal) => {
            if (kugouApiProcess === child) {
                kugouApiProcess = null
            }
            if (code !== 0 && signal !== 'SIGTERM') {
                console.warn('KuGou API process exited unexpectedly:', code, signal || '')
            }
        })

        child.once('error', (error) => {
            if (kugouApiProcess === child) {
                kugouApiProcess = null
            }
            console.error('KuGou API process failed to start:', error)
        })

        try {
            await waitForApiReachable(readyUrl)
            await delay(API_READY_SETTLE_DELAY_MS)
            return { ready: true, started: true }
        } catch (error) {
            stopKugouMusicApi()
            const errorMessage = error && error.message ? error.message : 'unknown error'
            console.log('KuGou API unavailable:', errorMessage)
            return { ready: false, error: errorMessage }
        }
    })().finally(() => {
        kugouApiStartupPromise = null
    })

    return kugouApiStartupPromise
}

function getKugouMusicApiProcess() {
    return kugouApiProcess
}

module.exports = {
    startKugouMusicApi,
    stopKugouMusicApi,
    getKugouMusicApiProcess,
    resolveBackendLaunch,
    waitForApiReachable,
    API_PORT,
    delay,
    probeServer,
    API_READY_TIMEOUT_MS,
    API_READY_POLL_INTERVAL_MS,
    API_READY_SETTLE_DELAY_MS,
}
