import request from '../utils/request'

export function togetherRequest(path, data = {}) {
    // The bundled list wrapper discards playMode and other participants' versions.
    // Use its generic authenticated API route for the complete protocol payload.
    let url = `/listentogether/${path}`
    if (path === 'sync/list/command') {
        url = '/api'
        const { roomId, ...playlistParam } = data
        data = { uri: '/api/listen/together/sync/list/command/report', data: {
            roomId, playlistParam: JSON.stringify({ anchorSongId: '', anchorPosition: -1, ...playlistParam }),
        } }
    } else if (path === 'invite') {
        url = '/api'
        data = { uri: '/api/listen/together/invite/message/send', data }
    }
    return request({ url, method: 'post', data, params: { timestamp: Date.now() }, suppressGlobalNotice: true })
}
