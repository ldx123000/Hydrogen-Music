export async function loadStoredPlaylist() {
    try {
        const playlist = await windowApi.getLastPlaylist()
        if (!playlist || typeof playlist !== 'object') return null
        return playlist
    } catch (_) {
        return null
    }
}

export function saveStoredPlaylist(playlist) {
    try {
        windowApi.saveLastPlaylist(JSON.stringify(playlist))
    } catch (_) {}
}

export function persistPlaylistBeforeExit(playlist) {
    try {
        windowApi.exitApp(JSON.stringify(playlist))
    } catch (_) {}
}
