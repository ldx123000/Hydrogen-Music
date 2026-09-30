// 播放页布局测量：验证「封面垂直居中」与「波形已接入」
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
    // 波形的可见条件依赖 currentMusic，这里给一首真实歌曲（不触发实际播放）
    playerStore.currentMusic = songs[0]
    playerStore.widgetState = false

    await new Promise(resolve => setTimeout(resolve, 1600))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const wave = document.querySelector('.hm-player-wave')
    const waveVisible = wave ? document.querySelector('.hm-player-wave.is-visible') !== null : false
    const cover = rect('.music-player .player-cover .cover')
    const coverWrap = rect('.music-player .player-cover')
    const info = rect('.music-player .player-info')
    const control = rect('.music-player .player-control')
    const barCount = document.querySelectorAll('.hm-player-wave .visualizer-bar').length

    // 居中判定：封面上下留白是否大致相等
    const gapTop = coverWrap && cover ? cover.y - coverWrap.y : null
    const gapBottom = coverWrap && cover ? (coverWrap.y + coverWrap.h) - (cover.y + cover.h) : null

    // 系统媒体控制：验证 initMediaSession 是否真的把元数据写上去了
    const mediaSessionReport = (() => {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return 'unsupported'
        const md = navigator.mediaSession.metadata
        return {
            playbackState: navigator.mediaSession.playbackState,
            metadata: md ? {
                title: md.title,
                artist: md.artist,
                album: md.album,
                artworkCount: (md.artwork || []).length,
            } : 'no-metadata',
        }
    })()

    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        coverWrap,
        cover,
        coverGapTop: gapTop,
        coverGapBottom: gapBottom,
        coverCenteredVertically: gapTop !== null && Math.abs(gapTop - gapBottom) <= 4,
        info,
        waveRect: rect('.hm-player-wave'),
        waveExists: !!wave,
        waveVisible,
        waveBarCount: barCount,
        control,
        mediaSession: mediaSessionReport,
    })
})()
