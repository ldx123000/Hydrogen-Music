export function getSongIdFromLink(value) {
    let url
    try {
        url = new URL(value)
    } catch {
        return null
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'music.163.com') return null

    const route = url.hash.startsWith('#/') ? new URL(url.origin + url.hash.slice(1)) : url
    if (route.pathname !== '/song' && route.pathname !== '/m/song') return null

    const id = route.searchParams.get('id')
    return /^[1-9]\d*$/.test(id || '') ? id : null
}
