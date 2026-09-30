(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')
    const userStore = pinia._s.get('userStore')

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), display: cs.display, opacity: cs.opacity }
    }

    // 取真实歌曲并进入播放页
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

    const click = selector => {
        const el = document.querySelector(selector)
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        return true
    }
    click('.music-player .player-control .control svg')
    await new Promise(resolve => setTimeout(resolve, 3500))

    const readBars = () => [...document.querySelectorAll('.hm-player-wave .visualizer-bar')].slice(0, 5).map(el => el.style.transform)
    const before = readBars()
    await new Promise(resolve => setTimeout(resolve, 1000))
    const after = readBars()

    // 头像图片是否真的加载出来（naturalWidth=0 说明是坏图）
    const avatarImg = document.querySelector('.user-head img')

    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        playing: playerStore.playing,

        // 1) 歌词开关是否露出来了
        songControl: rect('.music-player .song-control'),
        lyricToggles: document.querySelectorAll('.music-player .song-control .lyric-toggle').length,
        firstToggle: rect('.music-player .song-control .lyric-toggle'),
        lyricTypeNow: JSON.stringify(playerStore.lyricType),

        // 2) 单行歌词
        oneLineLyric: rect('.music-player .hm-one-line-lyric'),
        oneLineLyricText: (document.querySelector('.hm-one-line-lyric')?.innerText || '').slice(0, 40),
        currentLyricIndex: playerStore.currentLyricIndex,
        lyricsLen: Array.isArray(playerStore.lyricsObjArr) ? playerStore.lyricsObjArr.length : 'not-array',

        // 3) 波形是否在动
        waveRect: rect('.hm-player-wave'),
        waveBars: document.querySelectorAll('.hm-player-wave .visualizer-bar').length,
        barsAnimating: JSON.stringify(before) !== JSON.stringify(after),
        barsSample: after,

        // 4) 头像图是否加载
        avatar: avatarImg ? {
            naturalWidth: avatarImg.naturalWidth,
            naturalHeight: avatarImg.naturalHeight,
            src: (avatarImg.src || '').slice(0, 70),
            complete: avatarImg.complete,
        } : 'no-avatar-img',
        isLogin: document.cookie.split(';').some(c => c.trim().startsWith('MUSIC_U=')),
        userNickname: userStore?.user?.nickname || null,
    })
})()
