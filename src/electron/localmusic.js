const { ipcMain } = require('electron')
const scanLocalMusicTree = require('./dirTree')
const Store = require('electron-store').default

const moduleState = {
    initialized: false,
    win: null,
}

function getCacheKey(type) {
    return type === 'downloaded' ? 'localFiles.downloaded' : 'localFiles.local'
}

function getActiveWindow() {
    return moduleState.win
}

function sendToRenderer(channel, payload) {
    const win = getActiveWindow()
    if (!win || win.isDestroyed?.()) return
    if (!win.webContents || win.webContents.isDestroyed?.()) return
    win.webContents.send(channel, payload)
}

module.exports = function LocalFiles(win) {
    moduleState.win = win

    if (moduleState.initialized) {
        return {
            setWindow(nextWin) {
                moduleState.win = nextWin
            },
        }
    }

    moduleState.initialized = true
    const settingsStore = new Store({ name: 'settings' })
    const localStore = new Store({ name: 'localMusic' })

    function buildLocalPayload({ dirTree, metadata, type, count = 0, derived = null }) {
        return {
            dirTree,
            locaFilesMetadata: metadata,
            type,
            count,
            derived,
        }
    }

    async function persistLocalFiles(type, payload) {
        const cacheKey = getCacheKey(type)
        const nextPayload = {
            ...payload,
            derived: payload?.derived ?? null,
        }
        await localStore.set(cacheKey, nextPayload)
        return nextPayload
    }

    async function readLocalFiles(type, refresh) {
        const cacheKey = getCacheKey(type)
        const cachedPayload = !refresh ? await localStore.get(cacheKey) : null

        if (cachedPayload) {
            sendToRenderer('local-music-files', {
                ...cachedPayload,
                type,
            })
            return
        }

        const settings = await settingsStore.get('settings')
        const baseUrl = []

        if (type === 'downloaded') {
            if (settings?.local?.downloadFolder) baseUrl.push(settings.local.downloadFolder)
        } else if (type === 'local') {
            if (Array.isArray(settings?.local?.localFolder)) baseUrl.push(...settings.local.localFolder)
        }

        const dirTree = []
        const metadata = []
        let count = 0

        for (let i = 0; i < baseUrl.length; i += 1) {
            const result = await scanLocalMusicTree(baseUrl[i], getActiveWindow())
            dirTree.push(result.dirTree)
            metadata.push(result.metadata)
            count += Number(result.count || 0)
        }

        const nextPayload = await persistLocalFiles(type, buildLocalPayload({
            dirTree,
            metadata,
            type,
            count,
            derived: null,
        }))

        sendToRenderer('local-music-files', nextPayload)
    }

    ipcMain.on('scan-local-music', (_event, params = {}) => {
        readLocalFiles(params.type, params.refresh)
    })

    ipcMain.on('persist-local-music-derived', async (_event, payload = {}) => {
        const type = payload?.type
        if (type !== 'downloaded' && type !== 'local') return

        const cacheKey = getCacheKey(type)
        const cached = await localStore.get(cacheKey)
        if (!cached) return

        await localStore.set(cacheKey, {
            ...cached,
            derived: payload?.derived || null,
        })
    })

    ipcMain.on('clear-local-music-data', (_event, type) => {
        if (type === 'downloaded' || type === 'local') {
            localStore.set(getCacheKey(type), null)
        }
    })

    return {
        setWindow(nextWin) {
            moduleState.win = nextWin
        },
    }
}
