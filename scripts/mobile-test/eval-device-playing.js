(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')
    return JSON.stringify({
        playing: playerStore.playing,
        song: playerStore.songList?.[playerStore.currentIndex]?.name || null,
        songListLen: playerStore.songList?.length || 0,
        currentMusicSet: !!playerStore.currentMusic,
        widgetState: playerStore.widgetState,
    })
})()
