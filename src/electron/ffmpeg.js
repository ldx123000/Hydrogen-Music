const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const resourceRoot = app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '../../resources')
const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const ffmpegPath = path.join(resourceRoot, 'ffmpeg', `${process.platform}-${process.arch}`, executable)

if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`Missing FFmpeg runtime: ${ffmpegPath}. Run npm run ffmpeg:build before starting or packaging the desktop app.`)
}

module.exports = ffmpegPath
