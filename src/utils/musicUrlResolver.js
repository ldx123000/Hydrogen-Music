import { getCloudDiskSongUrl } from '../api/cloud'
import { getMusicUrl, getMusicUrlNew } from '../api/song'
import { getPreferredQuality } from './quality'
import request from './request'

const QUALITY_FALLBACK_ORDER = ['high', 'flac', '320', '128']

let deviceRegistered = false

/**
 * 注册设备（酷狗要求播放前先注册设备）
 * 仅在首次调用时执行一次，后续复用设备标识。
 */
async function ensureDeviceRegistered() {
  if (deviceRegistered) return
  try {
    await request({
      url: '/register/dev',
      method: 'get',
    })
    deviceRegistered = true
  } catch (error) {
    console.warn('设备注册失败，继续尝试播放:', error)
  }
}

function extractPlayableUrl(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = extractPlayableUrl(item)
            if (url) return url
        }
        return ''
    }
    if (typeof value !== 'object') return ''
    return extractPlayableUrl(
        value.url
        || value.play_url
        || value.playurl
        || value.music_url
        || value.downurl
        || value.data
    )
}

/**
 * 尝试用指定品质获取歌曲播放地址
 * 优先走 /song/url，拿不到时降级到 /song/url/new
 */
async function requestTrack(song, level) {
    // 云盘歌曲优先走酷狗专用接口，拿不到时再回退到普通歌曲地址接口。
    if (song && typeof song === 'object' && song.source === 'cloud') {
        const cloudUrlResult = await getCloudDiskSongUrl({
            hash: song?.hash || song?.cloudUrlParams?.hash,
            album_id: song?.cloudUrlParams?.album_id,
            album_audio_id: song?.album_audio_id || song?.cloudUrlParams?.album_audio_id,
            name: song?.cloudUrlParams?.name || song?.name,
        })
        const cloudUrl = extractPlayableUrl(cloudUrlResult?.data || cloudUrlResult)
        if (cloudUrl) {
            return {
                url: cloudUrl,
                level,
                type: cloudUrlResult?.data?.extName || cloudUrlResult?.data?.ext || 'mp3',
            }
        }
    }

    // 先尝试 /song/url（基础接口）
    const songInfo = await getMusicUrl(song, level)
    if (songInfo && songInfo.data && songInfo.data[0] && songInfo.data[0].url) {
        return songInfo.data[0]
    }

    // /song/url 未返回有效地址，降级到 /song/url/new（支持 VIP 凭证）
    try {
        const songInfoNew = await getMusicUrlNew(song, level)
        if (songInfoNew && songInfoNew.data && songInfoNew.data[0] && songInfoNew.data[0].url) {
            return songInfoNew.data[0]
        }
    } catch (fallbackError) {
        console.warn('/song/url/new 降级请求也失败:', fallbackError)
    }

    return null
}

function buildQualityFallbackLevels(preferredLevel) {
    const normalizedLevel = getPreferredQuality(preferredLevel)
    const preferredIndex = QUALITY_FALLBACK_ORDER.indexOf(normalizedLevel)
    if (preferredIndex === -1) return ['flac', '320', '128']

    return QUALITY_FALLBACK_ORDER.slice(preferredIndex)
}

export async function resolveTrackByQualityPreference(song, preferredLevel) {
    const fallbackLevels = buildQualityFallbackLevels(preferredLevel)
    let lastError = null

    // 在发起首次音质请求前确保设备已注册
    await ensureDeviceRegistered()

    for (const level of fallbackLevels) {
        try {
            const trackInfo = await requestTrack(song, level)
            if (trackInfo?.url) return trackInfo
        } catch (error) {
            // 记录最后一次错误，继续尝试更低一档音质。
            lastError = error
        }
    }

    if (lastError) throw lastError
    return null
}
