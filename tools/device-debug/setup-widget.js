// 注入播放列表但保持在浏览态，用于验证底部迷你播放条 + 导航栏的叠放关系
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
    // true = 浏览态：显示 Home + 底部迷你播放条
    playerStore.widgetState = true

    await new Promise(resolve => setTimeout(resolve, 1400))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    // 迷你播放条内部的直接子元素，便于判断哪些控件需要精简
    const widget = document.querySelector('.musicWidget')
    const children = widget
        ? [...widget.querySelectorAll('*')].slice(0, 14).map(el => ({
            cls: String(el.className || '').slice(0, 40),
            w: Math.round(el.getBoundingClientRect().width),
        }))
        : []

    return JSON.stringify({
        widget: rect('.musicWidget'),
        tabbar: rect('.hm-tabbar'),
        home: rect('.mainWindow .home'),
        children,
    })
})()
