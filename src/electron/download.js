const { ipcMain } = require('electron')
const fs = require('fs')
const fse = require('fs-extra')
const axios = require('axios')
const Store = require('electron-store').default;
const path = require('path');
const { nanoid } = require('nanoid')
let NodeID3 = null
let Metaflac = null
let Sharp = null
try { NodeID3 = require('node-id3') } catch (_) { NodeID3 = null }
try { Metaflac = require('metaflac-js') } catch (_) { Metaflac = null }
try { Sharp = require('sharp') } catch (_) { Sharp = null }
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
    // 以歌曲名创建文件夹，内部保存音频/歌词/封面，并在音频文件内写入元数据
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
          // 下载完成后，如果有歌词数据，按同名写入 .lrc，并尝试写入音频标签
          if (downloadObj && downloadObj.lyrics && (downloadObj.lyrics.lrc || downloadObj.lyrics.tlyric || downloadObj.lyrics.romalrc)) {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              const lrcPath = path.join(parsed.dir, parsed.name + '.lrc')
              // 生成最终合并 LRC 文本
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
              // 同步将歌词写入 MP3 或 FLAC 标签（无时间戳文本）
              try {
                const uslt = buildUnsyncedLyricText(downloadObj.lyrics)
                const extLower = (parsed.ext || '').toLowerCase()
                if (uslt && uslt.trim().length > 0) {
                  if (NodeID3 && extLower === '.mp3') {
                    NodeID3.update({ unsynchronisedLyrics: { language: 'chi', text: uslt } }, audioPath)
                  } else if (Metaflac && extLower === '.flac') {
                    const flac = new Metaflac(audioPath)
                    // 常见键：LYRICS/UNSYNCEDLYRICS，尽量都写一份
                    try { flac.setTag(`LYRICS=${uslt}`) } catch (_) {}
                    try { flac.setTag(`UNSYNCEDLYRICS=${uslt}`) } catch (_) {}
                    try { flac.save() } catch (_) {}
                  }
                }
              } catch (e) {
                console.warn('写入歌词到标签失败:', e && e.message ? e.message : e)
              }
            }
          }

          // 仅尝试写入音频封面标签（不再生成同名封面图片侧车）；自动将 webp 等转为 jpg/png
          if (downloadObj && downloadObj.coverUrl) {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              // 根据 content-type 或 URL 推断扩展名（用于判断与转码）
              const fetchAndSaveCover = async () => {
                try {
                  const resp = await axios.get(downloadObj.coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
                  const buf = Buffer.from(resp.data)
                  const contentType = (resp.headers && resp.headers['content-type']) || ''
                  const lowerUrl = downloadObj.coverUrl.split('?')[0].toLowerCase()
                  const isWebp = contentType.includes('webp') || lowerUrl.endsWith('.webp')
                  const isPngResp = contentType.includes('png') || lowerUrl.endsWith('.png')
                  const isJpegResp = contentType.includes('jpeg') || contentType.includes('jpg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')

                  // 准备嵌入的数据与 MIME；必要时用 sharp 转码为 jpg/png
                  let embedBuf = buf
                  let embedMime = isPngResp ? 'image/png' : (isJpegResp ? 'image/jpeg' : (isWebp ? 'image/webp' : ''))
                  if (Sharp) {
                    try {
                      // 若是 webp 或未知类型，优先尝试转码；有 alpha 用 png，无 alpha 用 jpeg
                      if (isWebp || (!isPngResp && !isJpegResp)) {
                        const img = Sharp(buf)
                        const meta = await img.metadata().catch(() => ({}))
                        const hasAlpha = !!meta.hasAlpha
                        if (hasAlpha) {
                          embedBuf = await img.toFormat('png').toBuffer()
                          embedMime = 'image/png'
                        } else {
                          embedBuf = await img.toFormat('jpeg', { mozjpeg: true, quality: 90 }).toBuffer()
                          embedMime = 'image/jpeg'
                        }
                      }
                    } catch (convErr) {
                      console.warn('封面转码失败，将尝试原图内嵌:', convErr && convErr.message ? convErr.message : convErr)
                    }
                  }
                  // 内嵌封面：mp3(APIC) / flac(PICTURE)。注意：metaflac-js 仅支持 jpg/png
                  try {
                    const extLower = (parsed.ext || '').toLowerCase()
                    const isPngEmbed = (embedMime || '').includes('png')
                    const isJpegEmbed = (embedMime || '').includes('jpeg') || (embedMime || '').includes('jpg')
                    if (NodeID3 && extLower === '.mp3') {
                      const mime = isPngEmbed ? 'image/png' : (isJpegEmbed ? 'image/jpeg' : 'image/jpeg')
                      NodeID3.update({ image: { mime, type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: embedBuf } }, audioPath)
                    } else if (Metaflac && extLower === '.flac') {
                      if (isPngEmbed || isJpegEmbed) {
                        try {
                          const flac = new Metaflac(audioPath)
                          flac.importPictureFromBuffer(embedBuf)
                          flac.save()
                        } catch (fe) {
                          console.warn('写入FLAC封面失败:', fe && fe.message ? fe.message : fe)
                        }
                      } else {
                        console.warn('FLAC 封面未写入：需要 PNG/JPEG，但当前类型为', embedMime || 'unknown')
                      }
                    }
                  } catch (e) {
                    console.warn('写入封面到标签失败:', e && e.message ? e.message : e)
                  }
                } catch (e) {
                  console.warn('下载封面失败:', e && e.message ? e.message : e)
                }
              }
              // 异步执行，不阻塞下载完成事件
              fetchAndSaveCover()
            }
          }

          // 在音频文件内写入基础标签（不再生成 .json 侧车）
          try {
            const audioPath = item.getSavePath()
            if (audioPath) {
              const parsed = path.parse(audioPath)
              // 基础标签：标题/艺术家/专辑
              try {
                const titleVal = downloadObj.fileName || parsed.name
                const artistsArr = Array.isArray(downloadObj.artists) ? downloadObj.artists.filter(Boolean) : []
                const albumVal = downloadObj.album || ''
                const extLower = (parsed.ext || '').toLowerCase()
                if (NodeID3 && extLower === '.mp3') {
                  const tag = {
                    title: titleVal,
                    artist: artistsArr.join(' / '),
                    album: albumVal,
                    comment: { language: 'XXX', text: 'Hydrogen Music' }
                  }
                  NodeID3.update(tag, audioPath)
                } else if (Metaflac && extLower === '.flac') {
                  try {
                    const flac = new Metaflac(audioPath)
                    if (titleVal) flac.setTag(`TITLE=${titleVal}`)
                    if (albumVal) flac.setTag(`ALBUM=${albumVal}`)
                    if (artistsArr.length) {
                      // 同时写入合并和分条 ARTIST，提升兼容性
                      try { flac.setTag(`ARTIST=${artistsArr.join(' / ')}`) } catch (_) {}
                      artistsArr.forEach(a => { try { if (a) flac.setTag(`ARTIST=${a}`) } catch (_) {} })
                    }
                    flac.save()
                  } catch (fe) {
                    console.warn('写入FLAC基础标签失败:', fe && fe.message ? fe.message : fe)
                  }
                }
              } catch (e) {
                console.warn('写入基础标签失败:', e && e.message ? e.message : e)
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

// 构建合并后的 LRC 文本：核心修复——兼容 [mm:ss:cc] 与 [mm:ss.xxx] 时间格式
function buildCombinedLrcText(lyricPayload, meta) {
  try {
    // 更宽松的时间标签解析：允许分隔符为 : ： . ． 。 , ， ; ； / - _ 或任意空白
    // 支持 [mm sep ss] 与 [mm sep ss sep cc] 形式（cc 可为 1-3 位，表示 10ms/1ms 精度）
    const timeTag = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,3}))?\]/g
    const parseLines = (text) => {
      const map = new Map()
      if (!text || typeof text !== 'string') return map
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (!raw) continue
        const tags = Array.from(raw.matchAll(timeTag))
        if (!tags || tags.length === 0) continue
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
      if (o) out += `${formatTag(t)}${o}\n`
      if (tr) out += `${formatTag(t)}${tr}\n`
      if (r) out += `${formatTag(t)}${r}\n`
    }
    return out
  } catch (e) {
    return ''
  }
}

// 生成无时间戳的纯文本歌词（用于内嵌到 MP3/FLAC 标签中）
function buildUnsyncedLyricText(lyricPayload) {
  try {
    const combined = buildCombinedLrcText(lyricPayload, null) || ''
    // 去掉所有 [..] 标签（时间与头部元信息），合并并清理空白
    const text = combined
      .replace(/\[[^\]]+\]/g, '')
      .replace(/[\t ]+/g, ' ')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter((line) => !!line)
      .join('\n')
    return text
  } catch (_) {
    return ''
  }
}
