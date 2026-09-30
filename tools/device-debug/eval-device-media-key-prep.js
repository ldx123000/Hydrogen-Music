(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    // 记录 JS 侧是否真的收到原生回传的媒体按键
    if (!window.__hmMediaActionLog) {
        window.__hmMediaActionLog = []
        const { registerPlugin } = await import('/assets/' + [...document.querySelectorAll('script[src]')]
            .map(s => s.src.split('/').pop())
            .find(n => n && n.startsWith('main-')) || 'main.js')
            .catch(() => ({}))
        void registerPlugin
    }

    // 准备一首歌并进入播放状态
    if (!playerStore.songList || !playerStore.songList.length) {
        try {
            const res = await fetch('http://127.0.0.1:36531/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1&limit=2')
            const songs = ((await res.json())?.result?.songs || []).map(s => ({
                id: s.id, name: s.name, ar: s.artists || s.ar || [], al: { id: s.album?.id, name: s.album?.name || '', picUrl: '' },
                dt: s.duration || s.dt, fee: s.fee, type: 'online',
            }))
            if (songs.length) {
                playerStore.songList = songs
                playerStore.currentIndex = 0
                playerStore.songId = songs[0].id
            }
        } catch (e) { }
    }
    playerStore.playing = true
    playerStore.widgetState = false
    await new Promise(resolve => setTimeout(resolve, 1200))

    return JSON.stringify({
        step: 'before-media-key',
        playing: playerStore.playing,
        currentSong: playerStore.songList?.[playerStore.currentIndex]?.name || null,
        songListLen: playerStore.songList?.length || 0,
    })
})()
