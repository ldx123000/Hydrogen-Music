const { ipcMain }= require('electron')
const getDirTree = require('./dirTree')
const Store = require('electron-store').default;


module.exports = function LocalFiles(win, app) {
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
                dirTree.push(await getDirTree(baseUrl[i], 'dir'))
                metadata.push(await getDirTree(baseUrl[i], 'data', win))
                count += metadata[i].count
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
}
