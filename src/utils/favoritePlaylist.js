export const DEFAULT_FAVORITE_PLAYLIST_NAME = '我喜欢的音乐'

export function normalizeFavoritePlaylistMeta(playlist) {
    const playlistId = playlist?.id ?? null
    if (!playlistId) return null

    const rawName = playlist?.name ?? playlist?.title ?? ''
    const playlistName = typeof rawName == 'string' ? rawName.trim() : String(rawName || '').trim()
    const isFavoritePlaylist = Number(playlist?.specialType) === 5
        || playlistName === DEFAULT_FAVORITE_PLAYLIST_NAME
        || playlistName.endsWith('喜欢的音乐')

    return {
        id: playlistId,
        name: isFavoritePlaylist ? DEFAULT_FAVORITE_PLAYLIST_NAME : (playlistName || DEFAULT_FAVORITE_PLAYLIST_NAME),
    }
}

export function resolveFavoritePlaylistMeta(playlists, userId = null) {
    const playlistList = Array.isArray(playlists) ? playlists : []
    if (playlistList.length == 0) return null

    const ownedPlaylists = playlistList.filter(playlist => !userId || playlist?.creator?.userId === userId)
    const candidatePlaylists = ownedPlaylists.length > 0 ? ownedPlaylists : playlistList

    const favoritePlaylist = candidatePlaylists.find(playlist => Number(playlist?.specialType) === 5)
        || candidatePlaylists.find(playlist => {
            const playlistName = typeof playlist?.name == 'string' ? playlist.name : ''
            return playlistName === DEFAULT_FAVORITE_PLAYLIST_NAME || playlistName.endsWith('喜欢的音乐')
        })
        || candidatePlaylists[0]

    return normalizeFavoritePlaylistMeta(favoritePlaylist)
}
