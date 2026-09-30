(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    const song = {
        id: 2650427950,
        name: '通知栏测试曲目',
        ar: [{ name: '测试歌手' }],
        al: { id: 1, name: '测试专辑', picUrl: '' },
        dt: 200000,
        type: 'online',
    }
    // 触发 push：曲目 + 播放中
    playerStore.songList = [song]
    playerStore.currentIndex = 0
    playerStore.songId = song.id
    playerStore.currentMusic = song
    playerStore.playing = true
    playerStore.widgetState = true

    await new Promise(resolve => setTimeout(resolve, 2200))

    return JSON.stringify({
        song: song.name,
        playing: playerStore.playing,
        note: '已触发 MediaNotification.show，请看 dumpsys notification',
    })
})()
