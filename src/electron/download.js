const { ipcMain } = require('electron')
const fs = require('fs')
const fsp = fs.promises
const axios = require('axios')
const Store = require('electron-store').default
const path = require('path')
const { nanoid } = require('nanoid')
let NodeID3 = null
let Metaflac = null
let Sharp = null
try { NodeID3 = require('node-id3') } catch (_) { NodeID3 = null }
try { Metaflac = require('metaflac-js') } catch (_) { Metaflac = null }
try { Sharp = require('sharp') } catch (_) { Sharp = null }

const moduleState = {
  initialized: false,
  win: null,
  isClose: false,
  currentDownloadItem: null,
  pendingDownloadContext: null,
}

const downloadContextByItem = new WeakMap()

function getActiveWindow() {
  return moduleState.win
}

function sendToRenderer(channel, payload) {
  const win = getActiveWindow()
  if (!win || win.isDestroyed?.()) return
  if (!win.webContents || win.webContents.isDestroyed?.()) return
  if (typeof payload === 'undefined') win.webContents.send(channel)
  else win.webContents.send(channel, payload)
}

function updateWindowProgress(progress) {
  const win = getActiveWindow()
  if (!win || win.isDestroyed?.()) return
  try {
    win.setProgressBar(progress)
  } catch (_) {}
}

function sanitize(name) {
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

function parseHttpUrl(value) {
  try {
    const parsedUrl = new URL(String(value || '').trim())
    if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') return parsedUrl
  } catch (_) {}
  return null
}

function isPrivateNetworkHost(hostname) {
  const normalizedHost = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '')

  if (!normalizedHost) return true
  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost') || normalizedHost.endsWith('.local')) return true
  if (normalizedHost.includes(':')) return true
  if (!normalizedHost.includes('.')) return true

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedHost)) return false

  const octets = normalizedHost.split('.').map(part => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true

  const [first, second] = octets
  if (first === 0 || first === 10 || first === 127) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  if (first === 198 && (second === 18 || second === 19)) return true
  if (first >= 224) return true
  return false
}

function parseSafeRemoteUrl(value) {
  const parsedUrl = parseHttpUrl(value)
  if (!parsedUrl) return null
  return isPrivateNetworkHost(parsedUrl.hostname) ? null : parsedUrl
}

function normalizeDownloadExtension(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(normalized) ? normalized : 'bin'
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath)
    return true
  } catch (_) {
    return false
  }
}

async function ensureDirectory(targetPath) {
  try {
    await fsp.mkdir(targetPath, { recursive: true })
  } catch (_) {}
}

async function isDirectory(targetPath) {
  try {
    const stat = await fsp.stat(targetPath)
    return stat.isDirectory()
  } catch (_) {
    return false
  }
}

async function findAvailableDirectoryPath(basePath) {
  let candidatePath = basePath
  let suffix = 1
  while (await pathExists(candidatePath)) {
    if (await isDirectory(candidatePath)) return candidatePath
    candidatePath = `${basePath} (${suffix++})`
  }
  return candidatePath
}

async function findAvailableFilePath(destDir, fileName, extension) {
  let suffix = 1
  let candidateName = `${fileName}.${extension}`
  while (await pathExists(path.join(destDir, candidateName))) {
    candidateName = `${fileName} (${suffix++}).${extension}`
  }
  return path.join(destDir, candidateName)
}

async function prepareDownloadDestination(context, settings) {
  const createSongFolder = !!(settings && settings.local && settings.local.downloadCreateSongFolder)
  const baseName = sanitize(context.fileName)
  const baseSavePath = path.resolve(context.savePath)

  if (createSongFolder) {
    const folderPath = await findAvailableDirectoryPath(path.join(baseSavePath, baseName))
    await ensureDirectory(folderPath)
    return path.join(folderPath, `${baseName}.${context.type}`)
  }

  await ensureDirectory(baseSavePath)
  return findAvailableFilePath(baseSavePath, baseName, context.type)
}

async function prepareInterruptedDownloadPath(context, interruptedTimes) {
  const baseName = sanitize(context.fileName)
  const baseSavePath = path.resolve(context.savePath)
  if (interruptedTimes > 3) {
    await ensureDirectory(baseSavePath)
    return path.join(baseSavePath, `undefined_name_${nanoid()}.${context.type}`)
  }

  const dirPath = interruptedTimes > 1
    ? path.join(baseSavePath, `${baseName} (${interruptedTimes})`)
    : path.join(baseSavePath, baseName)
  await ensureDirectory(dirPath)
  return path.join(dirPath, `${baseName}.${context.type}`)
}

async function writeLyricFileIfNeeded(lrcPath, lrcText) {
  if (!lrcText || !lrcText.trim()) return
  if (await pathExists(lrcPath)) return
  try {
    await fsp.writeFile(lrcPath, lrcText, 'utf8')
  } catch (e) {
    console.warn('写入歌词文件失败:', e)
  }
}

async function finalizeDownloadMetadata(item, context, settings) {
  if (!context) return
  const audioPath = item.getSavePath()
  if (!audioPath) return
  const parsed = path.parse(audioPath)
  const saveLyricFile = !!(settings && settings.local && settings.local.downloadSaveLyricFile)

  if (context.lyrics && (context.lyrics.lrc || context.lyrics.tlyric || context.lyrics.romalrc)) {
    const lrcText = buildCombinedLrcText(context.lyrics, {
      name: context.fileName,
      artists: Array.isArray(context.artists) ? context.artists : [],
      album: context.album || null,
    })
    const lrcPath = path.join(parsed.dir, parsed.name + '.lrc')
    if (saveLyricFile) {
      await writeLyricFileIfNeeded(lrcPath, lrcText)
    }

    try {
      const timedLrcText = lrcText
      const fallbackPlainText = buildUnsyncedLyricText(context.lyrics)
      const hasTimedTags = typeof timedLrcText === 'string' && /\[\d{1,3}[:：.\uFF0E\u3002,，;；/\-_\s]\s*\d{1,2}/.test(timedLrcText)
      const lyricTextForEmbed = (hasTimedTags ? timedLrcText : fallbackPlainText) || ''
      const sylt = hasTimedTags ? buildSynchronisedLyricsFrames(context.lyrics) : null
      const extLower = (parsed.ext || '').toLowerCase()
      if (lyricTextForEmbed && lyricTextForEmbed.trim().length > 0) {
        if (NodeID3 && extLower === '.mp3') {
          const tags = { unsynchronisedLyrics: { language: 'chi', text: lyricTextForEmbed } }
          if (sylt && Array.isArray(sylt) && sylt.length) tags.synchronisedLyrics = sylt
          NodeID3.update(tags, audioPath)
        } else if (Metaflac && extLower === '.flac') {
          const flac = new Metaflac(audioPath)
          const plain = (fallbackPlainText || '').trim()
          const timed = (timedLrcText || '').trim()
          if (plain) {
            try { flac.setTag(`LYRICS=${plain}`) } catch (_) {}
            try { flac.setTag(`UNSYNCEDLYRICS=${plain}`) } catch (_) {}
          } else if (timed) {
            try { flac.setTag(`LYRICS=${timed}`) } catch (_) {}
          }
          if (hasTimedTags && timed) {
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

  if (context.coverUrl) {
    const fetchAndSaveCover = async () => {
      try {
        const resp = await axios.get(context.coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
        const buf = Buffer.from(resp.data)
        const contentType = (resp.headers && resp.headers['content-type']) || ''
        const lowerUrl = context.coverUrl.split('?')[0].toLowerCase()
        const isWebp = contentType.includes('webp') || lowerUrl.endsWith('.webp')
        const isPngResp = contentType.includes('png') || lowerUrl.endsWith('.png')
        const isJpegResp = contentType.includes('jpeg') || contentType.includes('jpg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')

        let embedBuf = buf
        let embedMime = isPngResp ? 'image/png' : (isJpegResp ? 'image/jpeg' : (isWebp ? 'image/webp' : ''))
        if (Sharp) {
          try {
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
    fetchAndSaveCover()
  }

  try {
    const titleVal = context.fileName || parsed.name
    const artistsArr = Array.isArray(context.artists) ? context.artists.filter(Boolean) : []
    const albumVal = context.album || ''
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
      const flac = new Metaflac(audioPath)
      if (titleVal) flac.setTag(`TITLE=${titleVal}`)
      if (albumVal) flac.setTag(`ALBUM=${albumVal}`)
      if (artistsArr.length) {
        try { flac.setTag(`ARTIST=${artistsArr.join(' / ')}`) } catch (_) {}
        artistsArr.forEach(artist => { try { if (artist) flac.setTag(`ARTIST=${artist}`) } catch (_) {} })
      }
      try { flac.save() } catch (fe) {
        console.warn('写入FLAC基础标签失败:', fe && fe.message ? fe.message : fe)
      }
    }
  } catch (e) {
    console.warn('写入基础标签失败:', e && e.message ? e.message : e)
  }
}

module.exports = MusicDownload = (win) => {
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

  ipcMain.on('download-resume', () => {
    if (!moduleState.currentDownloadItem) return
    try { moduleState.currentDownloadItem.resume() } catch (_) {}
  })

  ipcMain.on('download-pause', (_event, close) => {
    if (!moduleState.currentDownloadItem) return
    if (close == 'shutdown') {
      moduleState.isClose = true
      try { moduleState.currentDownloadItem.cancel() } catch (_) {}
      return
    }
    try { moduleState.currentDownloadItem.pause() } catch (_) {}
  })

  ipcMain.on('download-cancel', () => {
    if (!moduleState.currentDownloadItem) return
    try { moduleState.currentDownloadItem.cancel() } catch (_) {}
  })

  ipcMain.on('download', async (_event, args = {}) => {
    const parsedDownloadUrl = parseSafeRemoteUrl(args.url)
    if (!parsedDownloadUrl) {
      sendToRenderer('download-error', 'invalidDownloadUrl')
      sendToRenderer('download-next')
      return
    }

    const settings = await settingsStore.get('settings')
    const downloadFolder = settings?.local?.downloadFolder
    if (!downloadFolder) {
      sendToRenderer('download-error', 'noSavePath')
      sendToRenderer('download-next')
      return
    }

    moduleState.pendingDownloadContext = {
      downloadUrl: parsedDownloadUrl.toString(),
      fileName: args.name,
      type: normalizeDownloadExtension(args.type),
      savePath: path.resolve(downloadFolder),
      resolvedSavePath: null,
      id: args.id || null,
      lyrics: args.lyrics || null,
      coverUrl: parseSafeRemoteUrl(args.coverUrl)?.toString() || null,
      artists: args.artists || null,
      album: args.album || null,
    }

    try {
      moduleState.pendingDownloadContext.resolvedSavePath = await prepareDownloadDestination(moduleState.pendingDownloadContext, settings)
    } catch (error) {
      console.warn('预计算下载路径失败:', error)
    }

    const activeWin = getActiveWindow()
    if (!activeWin || activeWin.isDestroyed?.() || !activeWin.webContents || activeWin.webContents.isDestroyed?.()) {
      moduleState.pendingDownloadContext = null
      sendToRenderer('download-error', 'downloadWindowUnavailable')
      sendToRenderer('download-next')
      return
    }

    activeWin.webContents.downloadURL(moduleState.pendingDownloadContext.downloadUrl)
  })

  win.webContents.session.on('will-download', (_event, item) => {
    moduleState.currentDownloadItem = item || null
    const currentDownload = moduleState.pendingDownloadContext
      ? { ...moduleState.pendingDownloadContext }
      : {
        downloadUrl: item.getURL(),
        fileName: path.parse(item.getFilename()).name,
        type: normalizeDownloadExtension(path.extname(item.getFilename())),
        savePath: '',
        resolvedSavePath: null,
        id: null,
        lyrics: null,
        coverUrl: null,
        artists: null,
        album: null,
      }
    moduleState.pendingDownloadContext = null
    downloadContextByItem.set(item, currentDownload)

    const settings = (() => {
      try { return settingsStore.get('settings') || null } catch (_) { return null }
    })()

    const preparedSavePath = currentDownload.resolvedSavePath
    if (preparedSavePath) {
      try {
        item.setSavePath(preparedSavePath)
      } catch (error) {
        console.warn('设置下载路径失败:', error)
      }
    }

    const totalBytes = item.getTotalBytes()
    let interruptedTimes = 0

    item.on('updated', async (_updatedEvent, state) => {
      let progress = item.getReceivedBytes() / totalBytes
      progress = Math.round(progress * 100)
      updateWindowProgress(progress / 100)

      if (state === 'interrupted') {
        interruptedTimes += 1
        try {
          const nextSavePath = await prepareInterruptedDownloadPath(currentDownload, interruptedTimes)
          item.setSavePath(nextSavePath)
          if (interruptedTimes > 3) interruptedTimes = 0
          item.resume()
        } catch (_) {}
      }

      sendToRenderer('download-progress', progress)
    })

    item.once('done', async (_doneEvent, state) => {
      const context = downloadContextByItem.get(item) || currentDownload
      if (state === 'completed') {
        try {
          await finalizeDownloadMetadata(item, context, settings)
        } catch (error) {
          console.warn('处理下载元数据失败:', error)
        }
      } else {
        console.log(`Download failed: ${state}`)
      }

      updateWindowProgress(-1)
      if (moduleState.currentDownloadItem === item) moduleState.currentDownloadItem = null
      if (!moduleState.isClose) sendToRenderer('download-next')
    })
  })

  return {
    setWindow(nextWin) {
      moduleState.win = nextWin
    },
  }
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
