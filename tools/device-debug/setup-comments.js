// 进入播放页并切到评论视图，验证移动端三视图切换是否正常
(async () => {
    const response = await fetch('/api/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&limit=6')
    const data = await response.json()
    const rawSongs = (data && data.result && data.result.songs) || []
    if (!rawSongs.length) return 'no-songs'

    const domCover = document.querySelector('img[src^="http"]')?.src || ''
    const songs = rawSongs.map(song => ({
        id: song.id,
        name: song.name,
        ar: song.artists || song.ar || [],
        al: { id: song.album?.id, name: song.album?.name || '', picUrl: domCover },
        dt: song.duration || song.dt,
        fee: song.fee,
        type: 'online',
    }))

    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    playerStore.songList = songs
    playerStore.currentIndex = 0
    playerStore.songId = songs[0].id
    playerStore.currentMusic = null
    playerStore.widgetState = false

    await new Promise(resolve => setTimeout(resolve, 1200))

    // 顶栏按钮：0=返回 1=歌词 2=评论
    const buttons = [...document.querySelectorAll('.hm-player-topbar .hm-player-btn')]
    const labels = buttons.map(btn => btn.getAttribute('aria-label'))
    const commentBtn = buttons.find(btn => btn.getAttribute('aria-label') === '评论')
    commentBtn?.click()

    await new Promise(resolve => setTimeout(resolve, 2200))

    const root = document.querySelector('.music-player')
    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    return JSON.stringify({
        topbarButtons: labels,
        rootClass: root ? root.className : null,
        coverVisible: rect('.player-container'),
        rightPanel: rect('.right-panel'),
        comments: rect('.comments-container'),
    })
})()
