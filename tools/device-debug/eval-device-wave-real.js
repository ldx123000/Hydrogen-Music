(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    // 取真实歌曲（走 App 自己的转发层）
    let songs = []
    try {
        const res = await fetch('http://127.0.0.1:36531/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1&limit=3')
        const data = await res.json()
        songs = (data?.result?.songs || []).map(s => ({
            id: s.id, name: s.name, ar: s.artists || s.ar || [],
            al: { id: s.album?.id, name: s.album?.name || '', picUrl: s.album?.artist?.img1v1Url || s.album?.picUrl || '' },
            dt: s.duration || s.dt, fee: s.fee, type: 'online',
        }))
    } catch (e) {
        return JSON.stringify({ error: '取歌失败: ' + e.message })
    }
    if (!songs.length) return JSON.stringify({ error: '没取到歌曲' })

    // 打开播放页并选中歌曲
    playerStore.songList = songs
    playerStore.currentIndex = 0
    playerStore.songId = songs[0].id
    playerStore.widgetState = false
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 点真实的播放按钮，走用户同一条路径
    const clicked = []
    const tryClick = selector => {
        const el = document.querySelector(selector)
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        clicked.push(selector)
        return true
    }
    tryClick('.music-player .player-control .control svg')
        || tryClick('.music-player .player-control .control')

    await new Promise(resolve => setTimeout(resolve, 4000))

    const cm = playerStore.currentMusic
    const readBars = () => [...document.querySelectorAll('.hm-player-wave .visualizer-bar')]
        .slice(0, 6).map(el => el.style.transform)
    const before = readBars()
    await new Promise(resolve => setTimeout(resolve, 1200))
    const after = readBars()

    const audioEls = [...document.querySelectorAll('audio')].map(a => ({
        src: (a.src || '').slice(0, 60), paused: a.paused, currentTime: Number(a.currentTime.toFixed(2)),
        crossOrigin: a.crossOrigin, readyState: a.readyState,
    }))

    return JSON.stringify({
        gotSongs: songs.length,
        clicked,
        playing: playerStore.playing,
        currentMusicType: cm ? Object.prototype.toString.call(cm) : null,
        internals: cm ? {
            webAudio: cm.__hmWebAudioPlayer === true,
            hifi: cm.__hmHifiOutputPlayer === true,
            howlContext: !!cm._context,
            howlGain: !!cm._gain,
            soundsCount: Array.isArray(cm._sounds) ? cm._sounds.length : 0,
            nodeType: cm._sounds?.[0]?._node ? Object.prototype.toString.call(cm._sounds[0]._node) : null,
            hasBufferSource: !!cm._sounds?.[0]?._node?.bufferSource,
            hasAnalyser: !!cm.__hmTopVisualizerAnalyser,
        } : null,
        audioEls,
        barsBefore: before,
        barsAfter: after,
        barsAnimating: JSON.stringify(before) !== JSON.stringify(after),
        waveEl: !!document.querySelector('.hm-player-wave'),
        waveVisible: !!document.querySelector('.hm-player-wave.is-visible'),
    })
})()
