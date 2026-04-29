import { getMusicUrl } from '../api/song'
import { getPreferredQuality } from './quality'

async function requestTrack(hash, level) {
    const songInfo = await getMusicUrl(hash, level)
    return songInfo && songInfo.data && songInfo.data[0] ? songInfo.data[0] : null
}

export async function resolveTrackByQualityPreference(hash, preferredLevel) {
    const level = getPreferredQuality(preferredLevel)
    return requestTrack(hash, level)
}
