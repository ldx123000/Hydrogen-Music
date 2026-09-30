(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const localStore = pinia._s.get('localStore')
    const playerStore = pinia._s.get('playerStore')

    const found = []
    const push = (where, song) => {
        if (!song) return
        const name = song.name || song.songName || ''
        if (/bang/i.test(name)) {
            found.push({ where, id: song.id, name, artist: (song.ar || song.artists || []).map(a => a && a.name).filter(Boolean).join('/') || song.artist || '', type: song.type || '', path: song.path || song.filePath || '' })
        }
    }

    const lists = [
        ['localMusicFolder', localStore?.localMusicFolder],
        ['downloadedMusicFolder', localStore?.downloadedMusicFolder],
        ['localMusicClassify', localStore?.localMusicClassify],
    ]
    for (const [where, data] of lists) {
        if (!Array.isArray(data)) continue
        const walk = (arr, depth = 0) => {
            if (depth > 3 || !Array.isArray(arr)) return
            for (const item of arr) {
                if (!item) continue
                if (Array.isArray(item.songs) || Array.isArray(item.music) || Array.isArray(item.children)) {
                    walk(item.songs || item.music || item.children, depth + 1)
                } else if (Array.isArray(item)) {
                    walk(item, depth + 1)
                } else {
                    push(where, item)
                }
            }
        }
        walk(data)
    }

    return JSON.stringify({
        localCount: Array.isArray(localStore?.localMusicFolder) ? localStore.localMusicFolder.length : 'n/a',
        downloadedCount: Array.isArray(localStore?.downloadedMusicFolder) ? localStore.downloadedMusicFolder.length : 'n/a',
        matches: found.slice(0, 8),
        currentSong: playerStore.songList?.[playerStore.currentIndex]?.name || null,
    })
})()
