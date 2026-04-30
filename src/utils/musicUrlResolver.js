import { getCloudDiskSongUrl } from '../api/cloud'
import { getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'

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

    const songInfo = await getMusicUrl(song, level)
    return songInfo && songInfo.data && songInfo.data[0] ? songInfo.data[0] : null
}

export async function resolveTrackByQualityPreference(song, preferredLevel) {
    const level = getPreferredQuality(preferredLevel)
    return requestTrack(song, level)
}
