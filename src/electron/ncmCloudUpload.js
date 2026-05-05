const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')

const apiRoot = path.dirname(require.resolve('@neteasecloudmusicapienhanced/api'))
const uploadPlugin = require(path.join(apiRoot, 'plugins/songUpload'))
const createOption = require(path.join(apiRoot, 'util/option.js'))
const logger = require(path.join(apiRoot, 'util/logger.js'))
const {
    isTempFile,
    getFileSize,
    getFileMd5,
    cleanupTempFile,
    getFileExtension,
    sanitizeFilename,
} = require(path.join(apiRoot, 'util/fileHelper'))

let NodeID3 = null
let Metaflac = null
try { NodeID3 = require('node-id3') } catch (_) { NodeID3 = null }
try { Metaflac = require('metaflac-js') } catch (_) { Metaflac = null }

const CLOUD_INFO_INITIAL_DELAY = 1500
const CLOUD_UPLOAD_CHECK_RETRY_DELAYS = [2500, 4000, 6000]
const CLOUD_INFO_RETRY_DELAYS = [2500, 4000, 6000, 10000, 15000]
const AUDIO_PARSE_FAILED_CODE = 409

let mm

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function getCheckSongId(response) {
    const songId = String(response?.body?.songId || response?.body?.data?.[0]?.songId || '').trim()
    return !songId || songId === '0' ? '' : songId
}

function valueToSearchText(value) {
    if (value == null) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) return value.map(valueToSearchText).filter(Boolean).join(' ')
    if (typeof value === 'object') {
        return Object.entries(value)
            .map(([key, item]) => `${key}=${valueToSearchText(item)}`)
            .filter(Boolean)
            .join(' ')
    }
    return ''
}

function containsHydrogenMarkerText(text) {
    const normalized = String(text || '')
    return /Hydrogen Music;\s*NCM_ID\s*=\s*\d+/i.test(normalized)
        || /(?:^|[\s;])NCM_ID\s*=\s*\d+/i.test(normalized)
        || /(?:^|[\s;])NETEASE_ID\s*=\s*\d+/i.test(normalized)
        || /(?:^|[\s;])SOURCE\s*=\s*netease(?:$|[\s;])/i.test(normalized)
}

function hasHydrogenMarker(key, value) {
    const normalizedKey = String(key || '').trim().toUpperCase()
    const text = valueToSearchText(value)

    if (/^(?:NCM_ID|NETEASE_ID|SOURCE_SONG_ID)$/.test(normalizedKey) && /\d+/.test(text)) return true
    if (normalizedKey === 'SOURCE' && /netease/i.test(text)) return true
    if (containsHydrogenMarkerText(text)) return true

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const description = String(value.description || '').trim().toUpperCase()
        const nestedValueText = valueToSearchText(value.value)
        if (/^(?:NCM_ID|NETEASE_ID|SOURCE_SONG_ID)$/.test(description) && /\d+/.test(nestedValueText)) return true
        if (description === 'SOURCE' && /netease/i.test(nestedValueText)) return true
    }

    return false
}

function hasHydrogenSourceTags(metadata) {
    const common = metadata?.common || {}
    if (hasHydrogenMarker('COMMENT', common.comment)) return true
    if (hasHydrogenMarker('DESCRIPTION', common.description)) return true

    const nativeGroups = metadata?.native || {}
    return Object.values(nativeGroups).some(group => {
        if (!Array.isArray(group)) return false
        return group.some(tag => hasHydrogenMarker(tag?.id, tag?.value))
    })
}

function splitArtistNames(value) {
    return String(value || '')
        .split(/\s*(?:\/|／|、|,|，|;|；|&|＆|\band\b|\bwith\b|\bx\b|×|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
        .map(name => String(name || '').trim())
        .filter(Boolean)
}

function normalizeArtistText(value) {
    return Array.from(new Set(splitArtistNames(value))).join(' / ')
}

function extractAudioMetadata(metadata, fallbackTitle) {
    const info = metadata?.common || {}
    const songName = info.title || fallbackTitle || ''
    const album = info.album || ''
    const artistList = Array.isArray(info.artists)
        ? info.artists.flatMap(splitArtistNames)
        : []
    const artist = artistList.length
        ? Array.from(new Set(artistList)).join(' / ')
        : normalizeArtistText(info.artist)
    return { songName, album, artist }
}

function sanitizeTempFilename(filename) {
    const parsed = path.parse(String(filename || 'upload.mp3'))
    const safeName = (parsed.name || 'upload').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'upload'
    const safeExt = (parsed.ext || '.mp3').replace(/[^\w.]+/g, '') || '.mp3'
    return `${safeName}${safeExt}`
}

async function removePathIfExists(targetPath) {
    if (!targetPath) return
    try {
        await fsp.rm(targetPath, { recursive: true, force: true })
    } catch (_) {}
}

async function createUploadTempCopy(songFile) {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hydrogen-cloud-upload-'))
    const tempFilePath = path.join(tempDir, sanitizeTempFilename(songFile?.name))
    if (isTempFile(songFile)) await fsp.copyFile(songFile.tempFilePath, tempFilePath)
    else await fsp.writeFile(tempFilePath, Buffer.from(songFile?.data || []))
    return { tempDir, tempFilePath }
}

async function stripHydrogenSourceTags({ tempFilePath, ext, songName, album, artist }) {
    const normalizedExt = String(ext || '').trim().toLowerCase()

    if (normalizedExt === 'mp3' && NodeID3) {
        NodeID3.removeTags(tempFilePath)
        NodeID3.update({
            title: songName || undefined,
            artist: artist || undefined,
            album: album || undefined,
            comment: { language: 'XXX', text: 'Hydrogen Music' },
        }, tempFilePath)
        return true
    }

    if (normalizedExt === 'flac' && Metaflac) {
        const flac = new Metaflac(tempFilePath)
        flac.removeTag('NCM_ID')
        flac.removeTag('NETEASE_ID')
        flac.removeTag('SOURCE')
        flac.removeTag('COMMENT')
        flac.setTag('COMMENT=Hydrogen Music')
        flac.save()
        return true
    }

    return false
}

async function prepareSongFileForUpload({ songFile, metadata, ext, songName, album, artist }) {
    if (!hasHydrogenSourceTags(metadata)) {
        return {
            songFile,
            cleanupPaths: [],
            sanitized: false,
        }
    }

    const { tempDir, tempFilePath } = await createUploadTempCopy(songFile)
    try {
        const sanitized = await stripHydrogenSourceTags({
            tempFilePath,
            ext,
            songName,
            album,
            artist,
        })

        if (!sanitized) {
            await removePathIfExists(tempDir)
            return {
                songFile,
                cleanupPaths: [],
                sanitized: false,
            }
        }

        return {
            songFile: {
                ...songFile,
                tempFilePath,
                data: undefined,
                size: undefined,
                md5: undefined,
            },
            cleanupPaths: [tempDir],
            sanitized: true,
        }
    } catch (error) {
        await removePathIfExists(tempDir)
        logger.info('净化上传文件标签失败，将回退为原文件上传:', error.message)
        return {
            songFile,
            cleanupPaths: [],
            sanitized: false,
        }
    }
}

async function requestCloudUploadCheck({ query, request, fileSize, fileMd5, bitrate }) {
    return request(
        `/api/cloud/upload/check`,
        {
            bitrate: String(bitrate),
            ext: '',
            length: fileSize,
            md5: fileMd5,
            songId: '0',
            version: 1,
        },
        createOption(query),
    )
}

async function waitForUploadCheckSongId({ query, request, fileSize, fileMd5, bitrate, initialResponse }) {
    let songId = getCheckSongId(initialResponse)
    if (songId) return songId

    for (const retryDelay of CLOUD_UPLOAD_CHECK_RETRY_DELAYS) {
        logger.info(`云盘上传检查未返回歌曲ID，等待 ${retryDelay}ms 后重新检查...`)
        await delay(retryDelay)
        try {
            const response = await requestCloudUploadCheck({
                query,
                request,
                fileSize,
                fileMd5,
                bitrate,
            })
            songId = getCheckSongId(response)
            if (songId) return songId
        } catch (error) {
            logger.info('云盘上传重新检查失败:', error.message)
        }
    }

    return ''
}

function isAudioParsePending(response) {
    const body = response && response.body
    const code = Number(body && body.code)
    const message = String((body && (body.msg || body.message)) || '')
    return code === AUDIO_PARSE_FAILED_CODE && /音频解析失败|当前文件是否为音频/.test(message)
}

function buildCloudInfoPayload({ query, fileMd5, filename, songName, album, artist, bitrate, resourceId, songId }) {
    return {
        md5: fileMd5,
        songid: songId,
        filename: query.songFile.name,
        song: songName || filename,
        album: album || '未知专辑',
        artist: artist || '未知艺术家',
        bitrate: String(bitrate),
        resourceId,
    }
}

async function uploadCloudInfoWithRetry(payload, query, request, options = {}) {
    let lastResponse = null
    const initialDelay = Number(options.initialDelay || 0)

    for (let attempt = 0; attempt <= CLOUD_INFO_RETRY_DELAYS.length; attempt += 1) {
        if (attempt === 0 && initialDelay > 0) {
            logger.info(`等待 ${initialDelay}ms 后登记云盘音频信息...`)
            await delay(initialDelay)
        } else if (attempt > 0) {
            const retryDelay = CLOUD_INFO_RETRY_DELAYS[attempt - 1]
            logger.info(`云盘音频解析未就绪，等待 ${retryDelay}ms 后重试登记...`)
            await delay(retryDelay)
        }

        let response
        try {
            response = await request(
                `/api/upload/cloud/info/v2`,
                payload,
                createOption(query),
            )
        } catch (error) {
            response = error
        }
        lastResponse = response

        if (response?.body?.code === 200) return response
        if (!isAudioParsePending(response)) return response
    }

    return lastResponse
}

module.exports = async (query, request) => {
    mm = require('music-metadata')

    if (!query.songFile) {
        throw {
            status: 500,
            body: {
                msg: '请上传音乐文件',
                code: 500,
            },
        }
    }

    query.songFile.name = Buffer.from(query.songFile.name, 'latin1').toString('utf-8')
    const ext = getFileExtension(query.songFile.name)
    const filename = sanitizeFilename(query.songFile.name)
    const bitrate = 999000
    const originalSongFile = query.songFile
    const originalUseTemp = isTempFile(originalSongFile)

    let preparedSongFile = {
        songFile: originalSongFile,
        cleanupPaths: [],
        sanitized: false,
    }

    try {
        let metadata = null
        try {
            metadata = originalUseTemp
                ? await mm.parseFile(originalSongFile.tempFilePath)
                : await mm.parseBuffer(originalSongFile.data, originalSongFile.mimetype)
        } catch (error) {
            logger.info('元数据解析错误:', error.message)
        }

        const { songName, album, artist } = extractAudioMetadata(metadata, filename)
        preparedSongFile = await prepareSongFileForUpload({
            songFile: originalSongFile,
            metadata,
            ext,
            songName,
            album,
            artist,
        })

        if (preparedSongFile.sanitized) {
            logger.info('检测到 Hydrogen Music 自定义网易标签，已按 v0.5.9 方式整理后再上传')
        }

        query.songFile = preparedSongFile.songFile
        const fileSize = await getFileSize(query.songFile)
        const fileMd5 = await getFileMd5(query.songFile)

        query.songFile.md5 = fileMd5
        query.songFile.size = fileSize

        const res = await requestCloudUploadCheck({
            query,
            request,
            fileSize,
            fileMd5,
            bitrate,
        })
        let cloudInfoSongId = getCheckSongId(res)

        const tokenRes = await request(
            `/api/nos/token/alloc`,
            {
                bucket: '',
                ext: ext,
                filename: filename,
                local: false,
                nos_product: 3,
                type: 'audio',
                md5: fileMd5,
            },
            createOption(query),
        )

        if (!tokenRes.body.result || !tokenRes.body.result.resourceId) {
            logger.error('Token分配失败:', tokenRes.body)
            throw {
                status: 500,
                body: {
                    code: 500,
                    msg: '获取上传token失败',
                    detail: tokenRes.body,
                },
            }
        }

        if (res.body.needUpload) {
            logger.info('需要上传，开始上传流程...')
            try {
                const uploadInfo = await uploadPlugin(query, request)
                logger.info('上传完成:', uploadInfo?.body?.result?.resourceId)
            } catch (uploadError) {
                logger.error('上传失败:', uploadError)
                throw uploadError
            }
        } else {
            logger.info('文件已存在，跳过上传')
        }

        if (!cloudInfoSongId) {
            cloudInfoSongId = await waitForUploadCheckSongId({
                query,
                request,
                fileSize,
                fileMd5,
                bitrate,
                initialResponse: res,
            })
        }

        if (!cloudInfoSongId) {
            throw {
                status: 400,
                body: {
                    code: 400,
                    msg: '云盘上传检查未返回可登记歌曲ID',
                    detail: res.body,
                },
            }
        }

        const res2 = await uploadCloudInfoWithRetry(
            buildCloudInfoPayload({
                query,
                fileMd5,
                filename,
                songName,
                album,
                artist,
                bitrate,
                resourceId: tokenRes.body.result.resourceId,
                songId: cloudInfoSongId,
            }),
            query,
            request,
            { initialDelay: res.body.needUpload ? CLOUD_INFO_INITIAL_DELAY : 0 },
        )

        if (!res2 || !res2.body || res2.body.code !== 200) {
            const responseBody = res2?.body || { code: 500, msg: '上传云盘信息失败' }
            logger.error('云盘信息上传失败:', responseBody)
            throw {
                status: res2?.status || 500,
                body: {
                    code: responseBody.code || 500,
                    msg: responseBody.msg || '上传云盘信息失败',
                    detail: responseBody,
                },
            }
        }

        const res3 = await request(
            `/api/cloud/pub/v2`,
            {
                songid: res2.body.songId,
            },
            createOption(query),
        )

        return {
            status: 200,
            body: {
                ...res.body,
                ...res3.body,
                cloudSongId: res2.body.songId,
                cloudResourceId: tokenRes.body.result.resourceId,
                cloudFileMd5: fileMd5,
                cloudFileName: query.songFile.name,
                cloudUploadMetadata: {
                    name: songName || filename,
                    album: album || '',
                    artist: artist || '',
                },
            },
            cookie: res.cookie,
        }
    } finally {
        query.songFile = originalSongFile
        if (originalUseTemp) {
            await cleanupTempFile(originalSongFile.tempFilePath)
        }
        for (const cleanupPath of preparedSongFile.cleanupPaths) {
            await removePathIfExists(cleanupPath)
        }
    }
}
