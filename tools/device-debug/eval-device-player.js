(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    const song = {
        id: 1,
        name: '真机测量用歌曲',
        ar: [{ name: '测试歌手' }],
        al: { id: 1, name: '测试专辑', picUrl: '' },
        dt: 200000,
        type: 'online',
    }
    playerStore.songList = [song]
    playerStore.currentIndex = 0
    playerStore.songId = song.id
    playerStore.currentMusic = song
    playerStore.widgetState = false

    await new Promise(resolve => setTimeout(resolve, 1700))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    const coverWrap = rect('.music-player .player-cover')
    const cover = rect('.music-player .player-cover .cover')
    const gapTop = coverWrap && cover ? cover.y - coverWrap.y : null
    const gapBottom = coverWrap && cover ? (coverWrap.y + coverWrap.h) - (cover.y + cover.h) : null

    let mediaSessionReport = 'unsupported'
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        const md = navigator.mediaSession.metadata
        mediaSessionReport = {
            playbackState: navigator.mediaSession.playbackState,
            metadata: md ? { title: md.title, artist: md.artist, artwork: (md.artwork || []).length } : 'no-metadata',
        }
    }

    return JSON.stringify({
        device: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        mobileAttr: document.documentElement.dataset.hmMobile,
        topbar: rect('.hm-player-topbar'),
        coverWrap,
        cover,
        gapTop,
        gapBottom,
        coverCenteredVertically: gapTop !== null && Math.abs(gapTop - gapBottom) <= 4,
        info: rect('.music-player .player-info'),
        wave: rect('.hm-player-wave'),
        waveVisible: !!document.querySelector('.hm-player-wave.is-visible'),
        waveBars: document.querySelectorAll('.hm-player-wave .visualizer-bar').length,
        control: rect('.music-player .player-control'),
        mediaSession: mediaSessionReport,
    })
})()
