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
    const settings = (() => {
      try { return settingsStore.get('settings') || null } catch (_) { return null }
    })()
    const createSongFolder = !!(settings && settings.local && settings.local.downloadCreateSongFolder)
    const saveLyricFile = !!(settings && settings.local && settings.local.downloadSaveLyricFile)

    // 以歌曲名创建文件夹，内部保存音频/歌词/封面，并在音频文件内写入元数据
    const baseName = sanitize(downloadObj.fileName)
    let destDir = downloadObj.savePath
    let audioFileName = baseName + '.' + downloadObj.type
    if (createSongFolder) {
      destDir = path.join(downloadObj.savePath, baseName)
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
      audioFileName = baseName + '.' + downloadObj.type
    } else {
      try { fse.ensureDirSync(downloadObj.savePath) } catch (_) {}
      // 文件名冲突处理：在同一目录下追加 (n)
      try {
        let suffix = 1
        const parsedType = '.' + String(downloadObj.type || '').replace(/^\./, '')
        const ext = parsedType === '.' ? '' : parsedType
        while (fs.existsSync(path.join(destDir, audioFileName))) {
          audioFileName = `${baseName} (${suffix++})${ext}`
        }
      } catch (_) {}
    }

    const audioPath = path.join(destDir, audioFileName)
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
          // 下载完成后：可选写入同名 .lrc；并始终尝试写入音频标签（内嵌歌词）
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
              if (saveLyricFile && lrcText && lrcText.trim().length > 0) {
                try {
                  // 若已存在第三方歌词文件，尊重现有文件，不覆盖
                  if (!fs.existsSync(lrcPath)) {
                    fs.writeFileSync(lrcPath, lrcText, 'utf8')
                  }
                } catch (e) {
                  console.warn('写入歌词文件失败:', e)
                }
              }
              // 将歌词写入 MP3 或 FLAC 标签（MP3: USLT/SYLT；FLAC: Vorbis comments）
              try {
                const timedLrcText = lrcText
                const fallbackPlainText = buildUnsyncedLyricText(downloadObj.lyrics)
                const hasTimedTags = typeof timedLrcText === 'string' && /\[\d{1,3}[:：.\uFF0E\u3002,，;；/\-_\s]\s*\d{1,2}/.test(timedLrcText)
                const lyricTextForEmbed = (hasTimedTags ? timedLrcText : fallbackPlainText) || ''
                const sylt = hasTimedTags ? buildSynchronisedLyricsFrames(downloadObj.lyrics) : null
                const extLower = (parsed.ext || '').toLowerCase()
                if (lyricTextForEmbed && lyricTextForEmbed.trim().length > 0) {
                  if (NodeID3 && extLower === '.mp3') {
                    const tags = { unsynchronisedLyrics: { language: 'chi', text: lyricTextForEmbed } }
                    if (sylt && Array.isArray(sylt) && sylt.length) tags.synchronisedLyrics = sylt
                    NodeID3.update(tags, audioPath)
                  } else if (Metaflac && extLower === '.flac') {
                    const flac = new Metaflac(audioPath)
                    // 兼容性优先：LYRICS 写纯文本；带时间戳的 LRC 额外写入自定义键，避免播放器直接显示时间标
                    const plain = (fallbackPlainText || '').trim()
                    const timed = (timedLrcText || '').trim()
                    if (plain) {
                      try { flac.setTag(`LYRICS=${plain}`) } catch (_) {}
                      try { flac.setTag(`UNSYNCEDLYRICS=${plain}`) } catch (_) {}
                    } else if (timed) {
                      // 没有纯文本时才回退写入（总比没有强）
                      try { flac.setTag(`LYRICS=${timed}`) } catch (_) {}
                    }
                    if (hasTimedTags && timed) {
                      // 非标准，但部分播放器/工具会读取；保留 .lrc 文件作为主要同步歌词来源
                      try { flac.setTag(`LRC=${timed}`) } catch (_) {}
                      try { flac.setTag(`LYRICS_LRC=${timed}`) } catch (_) {}
                      try { flac.setTag(`SYNCEDLYRICS=${timed}`) } catch (_) {}
                    }
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
    const timeTagSingle = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,3}))?\]/
    const lrcMetadataTagLine = /^\s*\[(?:ar|ti|al|by|offset|re|ve|au|length|language|lang)\s*:[^\]]*\]\s*$/i

    const extractUntimedPreludeLines = (text) => {
      const out = []
      if (!text || typeof text !== 'string') return out
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (typeof raw !== 'string') continue
        if (timeTagSingle.test(raw)) break
        const line = raw.trim()
        if (!line) continue
        if (lrcMetadataTagLine.test(line)) continue
        out.push(line)
      }
      return out
    }

    const parseLines = (text) => {
      const map = new Map()
      if (!text || typeof text !== 'string') return map
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (!raw) continue
        const tags = Array.from(raw.matchAll(timeTag))
        if (!tags || tags.length === 0) continue
        const lyricText = raw.replace(timeTag, '').trim()
        if (!lyricText) continue
        for (const m of tags) {
          const mm = parseInt(m[1] || '0', 10)
          const ss = parseInt(m[2] || '0', 10)
          const ms = m[3] ? parseInt((m[3] + '00').slice(0, 3), 10) : 0
          const t = mm * 60 + ss + ms / 1000
          const key = t.toFixed(3)
          const arr = map.get(key) || []
          arr.push(lyricText)
          map.set(key, arr)
        }
      }
      return map
    }

    const preludeLines = extractUntimedPreludeLines(lyricPayload && lyricPayload.lrc)
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
    for (const line of preludeLines) {
      out += `${line}\n`
    }
    for (const t of allTimes) {
      const key = t.toFixed(3)
      const oList = oMap.get(key) || []
      const trList = tMap.get(key) || []
      const rList = rMap.get(key) || []
      for (const o of oList) out += `${formatTag(t)}${o}\n`
      for (const tr of trList) out += `${formatTag(t)}${tr}\n`
      for (const r of rList) out += `${formatTag(t)}${r}\n`
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

// 生成带时间戳的同步歌词帧（ID3v2 SYLT），用于 MP3 内嵌同步歌词
function buildSynchronisedLyricsFrames(lyricPayload) {
  try {
    if (!NodeID3 || !NodeID3.TagConstants) return null
    const TagConstants = NodeID3.TagConstants
    const timeTag = /\[(\d{1,3})\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,2})(?:\s*[:：\.\uFF0E\u3002,，;；/\-_\s]\s*(\d{1,3}))?\]/g

    const extractEntries = (text) => {
      const entries = []
      if (!text || typeof text !== 'string') return entries
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
          const ms = m[3] ? parseInt((String(m[3]) + '00').slice(0, 3), 10) : 0
          const timeMs = Math.max(0, Math.round((mm * 60 + ss) * 1000 + ms))
          entries.push({ timeMs, text: lyricText })
        }
      }
      return entries
    }

    const grouped = new Map() // timeMs -> { o: [], t: [], r: [] }
    const addToGroup = (entries, key) => {
      for (const e of entries) {
        if (!e || typeof e.timeMs !== 'number' || e.timeMs < 0) continue
        const bucket = grouped.get(e.timeMs) || { o: [], t: [], r: [] }
        if (e.text && String(e.text).trim()) bucket[key].push(String(e.text).trim())
        grouped.set(e.timeMs, bucket)
      }
    }

    addToGroup(extractEntries(lyricPayload && lyricPayload.lrc), 'o')
    addToGroup(extractEntries(lyricPayload && lyricPayload.tlyric), 't')
    addToGroup(extractEntries(lyricPayload && lyricPayload.romalrc), 'r')

    const times = Array.from(grouped.keys()).sort((a, b) => a - b)
    const synchronisedText = []
    for (const timeMs of times) {
      const bucket = grouped.get(timeMs)
      if (!bucket) continue
      const parts = []
      if (bucket.o && bucket.o.length) parts.push(bucket.o.join('\n'))
      if (bucket.t && bucket.t.length) parts.push(bucket.t.join('\n'))
      if (bucket.r && bucket.r.length) parts.push(bucket.r.join('\n'))
      const text = parts.join('\n').trim()
      if (!text) continue
      synchronisedText.push({ text, timeStamp: timeMs })
    }
    if (!synchronisedText.length) return null

    return [{
      language: 'chi',
      timeStampFormat: TagConstants.TimeStampFormat.MILLISECONDS,
      contentType: TagConstants.SynchronisedLyrics.ContentType.LYRICS,
      shortText: 'Lyrics',
      synchronisedText
    }]
  } catch (_) {
    return null
  }
}
