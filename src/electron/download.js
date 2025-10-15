const { ipcMain } = require('electron')
const fs = require('fs')
const fse = require('fs-extra')
const axios = require('axios')
const Store = require('electron-store').default;
const path = require('path');
const { nanoid } = require('nanoid')
module.exports = MusicDownload = (win) => {
  const settingsStore = new Store({ name: 'settings' })
  let isClose = false
  const sanitize = (name) => {
    try {
      return String(name || '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'unknown'
    } catch (_) {
      return 'unknown'
    }
  }
  let downloadObj = {
    downloadUrl: '',
    fileName: '',
    type: '',
    savePath: '',
    id: null,
    lyrics: null,
    coverUrl: null,
    artists: null,
    album: null,
  }
  ipcMain.on('download', async (event, args) => {
    downloadObj.fileName = args.name
    downloadObj.downloadUrl = args.url
    downloadObj.type = args.type
    downloadObj.id = args.id || null
    downloadObj.lyrics = args.lyrics || null
    downloadObj.coverUrl = args.coverUrl || null
    downloadObj.artists = args.artists || null
    downloadObj.album = args.album || null
    const savePath = await settingsStore.get('settings')
    downloadObj.savePath = path.join(savePath.local.downloadFolder, path.sep)
    win.webContents.downloadURL(downloadObj.downloadUrl)
  })

  win.webContents.session.on('will-download', (event, item, webContents) => {
    // 以歌曲名创建文件夹，内部保存音频/歌词/封面
    const baseName = sanitize(downloadObj.fileName)
    let destDir = path.join(downloadObj.savePath, baseName)
    try {
      let suffix = 1
      while (fs.existsSync(destDir) && !fs.statSync(destDir).isDirectory()) {
        destDir = path.join(downloadObj.savePath, `${baseName} (${suffix++})`)
      }
      fse.ensureDirSync(destDir)
    } catch (e) {
      try { fse.ensureDirSync(downloadObj.savePath) } catch (_) {}
      destDir = downloadObj.savePath
    }

    const audioPath = path.join(destDir, baseName + '.' + downloadObj.type)
    item.setSavePath(audioPath)

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
        let alterPath = path.join(downloadObj.savePath, sanitize(downloadObj.fileName))
        if (true) {
          interruptedTimes++
          const tryDir = alterPath + (interruptedTimes > 1 ? ` (${interruptedTimes})` : '')
          try { fse.ensureDirSync(tryDir) } catch (_) {}
          item.setSavePath(path.join(tryDir, sanitize(downloadObj.fileName) + '.' + downloadObj.type))
          if (interruptedTimes > 3) {
            item.setSavePath(path.join(downloadObj.savePath, "undefined_name_" + nanoid() + "." + downloadObj.type))
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
        try {
          // 下载完成后，如果有歌词数据，按同名写入 .lrc
          if (downloadObj && downloadObj.lyrics && (downloadObj.lyrics.lrc || downloadObj.lyrics.tlyric || downloadObj.lyrics.romalrc)) {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              const lrcPath = path.join(parsed.dir, parsed.name + '.lrc')
              const lrcText = buildCombinedLrcText(downloadObj.lyrics, {
                name: downloadObj.fileName,
                artists: Array.isArray(downloadObj.artists) ? downloadObj.artists : [],
                album: downloadObj.album || null
              })
              if (lrcText && lrcText.trim().length > 0) {
                try {
                  // 若已存在第三方歌词文件，尊重现有文件，不覆盖
                  if (!fs.existsSync(lrcPath)) {
                    fs.writeFileSync(lrcPath, lrcText, 'utf8')
                  }
                } catch (e) {
                  console.warn('写入歌词文件失败:', e)
                }
              }
            }
          }

          // 下载封面为同名图片（若无内嵌封面可作为回退）
          if (downloadObj && downloadObj.coverUrl) {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              const targetDir = parsed.dir
              // 根据 content-type 或 URL 推断扩展名
              const fetchAndSaveCover = async () => {
                try {
                  const resp = await axios.get(downloadObj.coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
                  const buf = Buffer.from(resp.data)
                  const contentType = (resp.headers && resp.headers['content-type']) || ''
                  let ext = '.jpg'
                  if (contentType.includes('png')) ext = '.png'
                  else if (contentType.includes('webp')) ext = '.webp'
                  else if (contentType.includes('jpeg')) ext = '.jpg'
                  else {
                    // 从URL推断一次
                    const lower = downloadObj.coverUrl.split('?')[0].toLowerCase()
                    if (lower.endsWith('.png')) ext = '.png'
                    else if (lower.endsWith('.webp')) ext = '.webp'
                  }
                  const imgPath = path.join(targetDir, parsed.name + ext)
                  if (!fs.existsSync(imgPath)) {
                    fs.writeFileSync(imgPath, buf)
                  }
                } catch (e) {
                  console.warn('下载封面失败:', e && e.message ? e.message : e)
                }
              }
              // 异步执行，不阻塞下载完成事件
              fetchAndSaveCover()
            }
          }

          // 写入侧车元数据，便于本地读取歌手/专辑信息
          try {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              const metaPath = path.join(parsed.dir, parsed.name + '.json')
              if (!fs.existsSync(metaPath)) {
                const meta = {
                  id: downloadObj.id || null,
                  name: downloadObj.fileName || parsed.name,
                  artists: Array.isArray(downloadObj.artists) ? downloadObj.artists.filter(Boolean) : [],
                  album: downloadObj.album || null,
                  source: 'netease',
                  createdAt: Date.now()
                }
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
              }
            }
          } catch (e) {
            console.warn('写入元数据文件失败:', e && e.message ? e.message : e)
          }
        } catch (e) {
          console.warn('处理歌词写入时出错:', e)
        }
      } else {
        console.log(`Download failed: ${state}`)
      }
      if (!win.isDestroyed()) {
        win.setProgressBar(-1);
      }
      if (!isClose) win.webContents.send('download-next')
    })
    ipcMain.on('download-resume', () => {
      item.resume()
    })
    ipcMain.on('download-pause', (close) => {
      if (close == 'shutdown') {
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

// 构建合并后的 LRC 文本：原文、翻译、罗马音按同时间顺序输出
function buildCombinedLrcText(lyricPayload, meta) {
  try {
    const timeTag = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
    const parseLines = (text) => {
      const map = new Map()
      if (!text || typeof text !== 'string') return map
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (!raw) continue
        // 抽取所有时间标签
        const tags = Array.from(raw.matchAll(timeTag))
        if (!tags || tags.length === 0) continue
        // 行文本（去掉最后一个时间标签前的内容）
        const lyricText = raw.split(']').pop().trim()
        if (!lyricText) continue
        for (const m of tags) {
          const mm = parseInt(m[1] || '0', 10)
          const ss = parseInt(m[2] || '0', 10)
          const ms = m[3] ? parseInt((m[3] + '00').slice(0, 3), 10) : 0
          const t = mm * 60 + ss + ms / 1000
          const key = t.toFixed(3)
          map.set(key, lyricText)
        }
      }
      return map
    }

    const oMap = parseLines(lyricPayload.lrc)
    const tMap = parseLines(lyricPayload.tlyric)
    const rMap = parseLines(lyricPayload.romalrc)

    // 收集所有时间点（以原文为主，缺失时合并翻译/罗马音时间）
    const allKeysSet = new Set([...oMap.keys(), ...tMap.keys(), ...rMap.keys()])
    const allTimes = Array.from(allKeysSet).map(k => Number(k)).sort((a, b) => a - b)

    const formatTag = (sec) => {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      const ms = Math.round((sec - Math.floor(sec)) * 1000)
      const mm = String(m).padStart(2, '0')
      const ss = String(s).padStart(2, '0')
      const mmm = String(ms).padStart(3, '0')
      return `[${mm}:${ss}.${mmm}]`
    }

    let out = ''
    out += '[by:Hydrogen Music]\n'
    if (meta && (meta.name || (meta.artists && meta.artists.length) || meta.album)) {
      if (meta.name) out += `[ti:${meta.name}]\n`
      if (Array.isArray(meta.artists) && meta.artists.length) out += `[ar:${meta.artists.join(' / ')}]\n`
      if (meta.album) out += `[al:${meta.album}]\n`
    }
    for (const t of allTimes) {
      const key = t.toFixed(3)
      const o = oMap.get(key)
      const tr = tMap.get(key)
      const r = rMap.get(key)
      // 原文优先；若没有原文，也允许仅输出译文/罗马音
      if (o) out += `${formatTag(t)}${o}\n`
      if (tr) out += `${formatTag(t)}${tr}\n`
      if (r) out += `${formatTag(t)}${r}\n`
    }
    return out
  } catch (e) {
    return ''
  }
}
