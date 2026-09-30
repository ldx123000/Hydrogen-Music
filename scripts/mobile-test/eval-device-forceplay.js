(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')
    playerStore.playing = true
    await new Promise(resolve => setTimeout(resolve, 1500))
    return JSON.stringify({ playing: playerStore.playing, song: playerStore.songList?.[playerStore.currentIndex]?.name || null })
})()
