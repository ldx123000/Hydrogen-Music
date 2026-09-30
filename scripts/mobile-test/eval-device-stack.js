(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    let songs = []
    try {
        const res = await fetch('http://127.0.0.1:36531/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1&limit=3')
        songs = ((await res.json())?.result?.songs || []).map(s => ({
            id: s.id, name: s.name, ar: s.artists || s.ar || [],
            al: { id: s.album?.id, name: s.album?.name || '', picUrl: '' },
            dt: s.duration || s.dt, fee: s.fee, type: 'online',
        }))
    } catch (e) { }
    if (songs.length) {
        playerStore.songList = songs
        playerStore.currentIndex = 0
        playerStore.songId = songs[0].id
        playerStore.widgetState = false
    }
    await new Promise(resolve => setTimeout(resolve, 1800))

    const rows = [
        '.music-player .hm-player-topbar',
        '.music-player .player-cover',
        '.music-player .player-info',
        '.music-player .hm-one-line-lyric',
        '.music-player .hm-player-wave',
        '.music-player .song-control',
        '.music-player .player-control',
        '.music-player .player',
        '.music-player .player-container',
    ]
    const out = {}
    for (const selector of rows) {
        const el = document.querySelector(selector)
        if (!el) { out[selector.replace('.music-player ', '')] = 'missing'; continue }
        const b = el.getBoundingClientRect()
        out[selector.replace('.music-player ', '')] = {
            y: Math.round(b.y), h: Math.round(b.height),
            bottom: Math.round(b.y + b.height),
            offscreen: b.y + b.height > innerHeight + 1 || b.y < -1,
        }
    }

    const player = document.querySelector('.music-player .player')
    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        rows: out,
        playerScrollHeight: player ? player.scrollHeight : null,
        playerClientHeight: player ? player.clientHeight : null,
        playerOverflow: player ? getComputedStyle(player).overflowY : null,
        // 关键：播放按钮现在在屏幕内吗
        playBtn: (() => {
            const el = document.querySelector('.music-player .player-control .control svg')
            if (!el) return 'missing'
            const b = el.getBoundingClientRect()
            return { y: Math.round(b.y), bottom: Math.round(b.y + b.height), visible: b.y >= 0 && b.y + b.height <= innerHeight }
        })(),
    })
})()
