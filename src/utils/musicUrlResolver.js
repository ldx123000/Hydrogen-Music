import { getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'

async function requestTrack(song, level) {
    const songInfo = await getMusicUrl(song, level)
    return songInfo && songInfo.data && songInfo.data[0] ? songInfo.data[0] : null
}

export async function resolveTrackByQualityPreference(song, preferredLevel) {
    const level = getPreferredQuality(preferredLevel)
    return requestTrack(song, level)
}
