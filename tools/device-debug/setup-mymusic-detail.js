// 伪造登录态与歌单数据，进入「我创建的」详情页，测量移动端布局几何
// 用途：验证"详情应该全屏"这一改动（不触碰真实账号）
(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const userStore = pinia._s.get('userStore')
    const libraryStore = pinia._s.get('libraryStore')
    const playerStore = pinia._s.get('playerStore')

    document.cookie = 'MUSIC_U=layout-test-only; path=/'
    if (userStore) {
        userStore.user = { userId: 1, nickname: '布局测试', avatarUrl: '' }
        userStore.homePage = true
    }
    // 有播放列表会让 .my-music 不再是 full 态，更贴近真实
    if (playerStore) {
        playerStore.songList = playerStore.songList?.length
            ? playerStore.songList
            : [{ id: 1, name: '占位', ar: [], al: {}, dt: 1000, type: 'online' }]
    }
    if (libraryStore) {
        libraryStore.libraryInfo = {
            id: 123,
            name: '测试歌单',
            coverImgUrl: '',
            trackCount: 10,
            creator: { nickname: '测试' },
            tracks: [],
            playlist: { tracks: [] },
        }
        libraryStore.listType1 = 0
    }

    const router = app.config.globalProperties.$router
    await router.push('/mymusic/playlist/123')
    await new Promise(resolve => setTimeout(resolve, 1600))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const display = selector => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el).display : 'missing'
    }

    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        route: router.currentRoute.value.fullPath,
        myMusic: rect('.my-music'),
        myMusicClass: document.querySelector('.my-music')?.className || '',
        library: rect('.music-library'),
        libraryDisplay: display('.music-library'),
        libraryView: rect('.library-view'),
        detail: rect('.library-detail'),
        viewControl: rect('.library-detail .view-control'),
    })
})()
