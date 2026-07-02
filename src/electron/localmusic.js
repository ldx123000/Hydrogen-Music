const { ipcMain }= require('electron')
const crypto = require('crypto')
const scanLocalMusicTree = require('./dirTree')
const { getElectronStore } = require('./store')

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5')
        const stream = require('fs').createReadStream(filePath)
        stream.on('error', reject)
        stream.on('data', chunk => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex').toUpperCase()))
    })
}

function getLocalHashTracks(localStore) {
    const tracks = localStore.get('localHashTracks')
    return tracks && typeof tracks === 'object' ? tracks : {}
}

function normalizeLocalHashTrack(hash, song = {}) {
    const fileUrl = song?.common?.fileUrl || song?.url || song?.dirPath || ''
    if (!hash || !fileUrl) return null

    return {
        hash,
        id: song?.id || hash,
        name: song?.name || song?.common?.title || song?.common?.localTitle || '',
        url: fileUrl,
        dirPath: fileUrl,
        common: {
            ...(song?.common || {}),
            fileUrl,
        },
        format: song?.format || {},
    }
}

module.exports = async function LocalFiles(win, app) {
    const Store = await getElectronStore()
    const settingsStore = new Store({name: 'settings'})
    const localStore = new Store({name: 'localMusic'})
       
    function sendLocalFiles(dirTree, metadata, type, count) {
        let localData = {
            dirTree: dirTree,
            locaFilesMetadata: metadata,
            type: type,
            count: count
        }
        win.webContents.send('local-music-files', localData)
    }

    async function readLocalFiles(type, refresh) {
        let dirTree = []
        let metadata = []
        if(refresh || (!localStore.get('localFiles.downloaded') && type == 'downloaded') || (!localStore.get('localFiles.local') && type == 'local')) {
            let baseUrl = []
            if(type == 'downloaded') {
                let url = await settingsStore.get('settings')
                baseUrl.push(url.local.downloadFolder)
            } else if(type == 'local') {
                let url = await settingsStore.get('settings')
                baseUrl = url.local.localFolder
            }
            let count = 0
            for (let i = 0; i < baseUrl.length; i++) {
                const result = await scanLocalMusicTree(baseUrl[i], win)
                dirTree.push(result.dirTree)
                metadata.push(result.metadata)
                count += Number(result.count || 0)
            }
            sendLocalFiles(dirTree, metadata, type, count)
            count = null
            let localData = {
                dirTree: dirTree,
                locaFilesMetadata: metadata
            }
            if(type == 'downloaded') {
                localStore.set('localFiles.downloaded', localData)
            }  else if(type == 'local') {
                localStore.set('localFiles.local', localData)
            }
        } else {
            if(type == 'downloaded') {
                const data = await localStore.get('localFiles.downloaded')
                data.type = 'downloaded'
                win.webContents.send('local-music-files', data)
            }  else if(type == 'local') {
                const data =await localStore.get('localFiles.local')
                data.type = 'local'
                win.webContents.send('local-music-files', data)
            }

        }
    }
    ipcMain.on('scan-local-music', (e, params) => {
        readLocalFiles(params.type, params.refresh)
    })
    ipcMain.on('clear-local-music-data', (e, type) => {
        if(type == 'downloaded') {
            localStore.set('localFiles.downloaded', null)
        }  else if(type == 'local') {
            localStore.set('localFiles.local', null)
        }
    })
    ipcMain.handle('local-music:file-hash', async (e, filePath) => {
        if (!filePath) return ''
        return hashFile(filePath)
    })
    ipcMain.handle('local-music:remember-hash-track', (e, params = {}) => {
        const hash = String(params?.hash || '').trim().toUpperCase()
        const track = normalizeLocalHashTrack(hash, params?.song)
        if (!track) return false

        const tracks = getLocalHashTracks(localStore)
        tracks[hash] = track
        localStore.set('localHashTracks', tracks)
        return true
    })
    ipcMain.handle('local-music:get-hash-tracks', () => {
        return getLocalHashTracks(localStore)
    })
}
