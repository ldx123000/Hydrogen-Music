const { ipcMain } =  require('electron')
const Store = require('electron-store');
module.exports = MusicDownload = (win) => {
    const settingsStore = new Store({name: 'settings'})
    let isClose = false
    let downloadObj = {
        downloadUrl: '',
        fileName: '',
        type: '',
        savePath: ''
    }
    ipcMain.on('download', async (event, args) => {
        downloadObj.fileName = args.name
        downloadObj.downloadUrl = args.url
        downloadObj.type = args.type
        const savePath = await settingsStore.get('settings')
        downloadObj.savePath = savePath.local.downloadFolder + '\\'
        win.webContents.downloadURL(downloadObj.downloadUrl)
    })

    win.webContents.session.on('will-download', (event, item, webContents) => {
        item.setSavePath(downloadObj.savePath + downloadObj.fileName + '.' + downloadObj.type)

        const totalBytes = item.getTotalBytes();

        console.log(item.getURL())
        console.log(totalBytes)
        console.log(item.getSavePath())

        let interruptedTimes = 0
        item.on('updated', (event, state) => {
            let progress = item.getReceivedBytes() / totalBytes
            progress = Math.round(progress * 100)
            win.setProgressBar(progress / 100);
            
            if (state === 'interrupted') {
              console.log('Download is interrupted but can be resumed')
              let alterPath = (downloadObj.savePath + downloadObj.fileName)
              if(alterPath.indexOf('"') != -1 || alterPath.indexOf('?') != -1 || alterPath.indexOf('<') != -1 || alterPath.indexOf('>') != -1 || alterPath.indexOf(':') != -1) {
                interruptedTimes++
                alterPath = alterPath.replaceAll('"', "＂")
                alterPath = alterPath.replaceAll('?', "？")
                alterPath = alterPath.replaceAll('<', "＜")
                alterPath = alterPath.replaceAll('>', "＞")
                alterPath = alterPath.replaceAll(':', "：")
                item.setSavePath(alterPath + '.' + downloadObj.type)
                if(interruptedTimes > 3) {
                    item.setSavePath(downloadObj.savePath + 'undefined_name' + Math.trunc(Math.random(0,1) * 10000) + '.' + downloadObj.type)
                    interruptedTimes = 0
                }
                item.resume()
              }
              
            } else if (state === 'progressing') {
              if (item.isPaused()) {
                console.log('Download is paused')
              } else {
                console.log(progress)
              }
            }
            win.webContents.send('download-progress', progress)
        })
        item.once('done', (event, state) => {
            if (state === 'completed') {
              console.log('Download successfully')
            } else {
              console.log(`Download failed: ${state}`)
            }
            if (!win.isDestroyed()) {
                win.setProgressBar(-1);
            }
            if(!isClose) win.webContents.send('download-next')
        })
        ipcMain.on('download-resume', () => {
            item.resume()
        })
        ipcMain.on('download-pause', (close) => {
            if(close == 'shutdown') {
                isClose = true
                item.cancel()
            }
            else item.pause()
        })
        ipcMain.on('download-cancel', () => {
            item.cancel()
        })
    })
}