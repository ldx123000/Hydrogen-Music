(async () => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    // 关键：先关掉全屏播放器（上一个测量把它打开了），否则 Home 视图是 display:none，
    // 量什么都是 0×0
    playerStore.widgetState = true
    playerStore.songList = null
    playerStore.currentMusic = null
    await new Promise(resolve => setTimeout(resolve, 800))

    await router.push('/mymusic')
    await new Promise(resolve => setTimeout(resolve, 1000))
    await router.push('/mymusic/playlist/123456')
    await new Promise(resolve => setTimeout(resolve, 1800))

    const info = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
            rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
            display: cs.display,
        }
    }

    const myMusic = document.querySelector('.my-music')
    const libraryView = document.querySelector('.library-view')
    const vb = libraryView ? libraryView.getBoundingClientRect() : null

    return JSON.stringify({
        route: router.currentRoute.value.fullPath,
        viewport: { w: innerWidth, h: innerHeight },
        homeDisplay: document.querySelector('.home') ? getComputedStyle(document.querySelector('.home')).display : 'missing',
        myMusicClass: myMusic ? myMusic.className : null,
        myMusic: info('.my-music'),
        musicLibrary: info('.music-library'),
        libraryView: info('.library-view'),
        libraryDetail: info('.library-detail'),
        // 详情是否占满整屏（宽度铺满、高度接近可用高度）
        detailFillsWidth: !!(vb && vb.width >= innerWidth - 2),
        detailHeightRatio: vb ? Number((vb.height / innerHeight).toFixed(2)) : 0,
    })
})()
