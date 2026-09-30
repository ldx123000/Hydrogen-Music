(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    // 取真实歌曲进入播放页
    if (!playerStore.songList || !playerStore.songList.length) {
        try {
            const res = await fetch('http://127.0.0.1:36531/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1&limit=2')
            const songs = ((await res.json())?.result?.songs || []).map(s => ({
                id: s.id, name: s.name, ar: s.artists || s.ar || [],
                al: { id: s.album?.id, name: s.album?.name || '', picUrl: '' },
                dt: s.duration || s.dt, fee: s.fee, type: 'online',
            }))
            if (songs.length) {
                playerStore.songList = songs
                playerStore.currentIndex = 0
                playerStore.songId = songs[0].id
            }
        } catch (e) { }
    }
    playerStore.widgetState = false
    await new Promise(resolve => setTimeout(resolve, 1500))

    const btn = document.querySelector('.music-player .player-control .control svg')
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    await new Promise(resolve => setTimeout(resolve, 2500))

    const vis = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const cs = getComputedStyle(el)
        const b = el.getBoundingClientRect()
        return { display: cs.display, w: Math.round(b.width), h: Math.round(b.height) }
    }

    const visibleIcons = [...document.querySelectorAll('.music-player .song-control .icon')]
        .filter(el => getComputedStyle(el).display !== 'none')
        .map(el => String(el.getAttribute('class')).replace('icon', '').trim() || '(无类名)')

    return JSON.stringify({
        playing: playerStore.playing,
        // 应被隐藏的两个
        commentIcon: vis('.music-player .song-control .comment-icon'),
        desktopLyricBtn: vis('.music-player .song-control .desktop-lyric-btn'),
        // 应保留的
        likeIcon: vis('.music-player .song-control .like-icon'),
        // 这一行实际还剩哪些
        visibleIconClasses: visibleIcons,
        // 右上角按钮的圆形高亮是否已清掉
        topbarBtnBg: (() => {
            const el = document.querySelector('.music-player .hm-player-btn')
            if (!el) return 'missing'
            const cs = getComputedStyle(el)
            return { background: cs.backgroundColor, backgroundImage: cs.backgroundImage, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, outline: cs.outlineStyle }
        })(),
    })
})()
