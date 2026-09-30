(async () => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    const report = {}

    // 1) WebView 能力探测：Media Session 是否可用（决定通知栏要不要走原生）
    report.webView = {
        hasMediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
        hasMediaMetadata: typeof window.MediaMetadata,
        hasNotificationApi: typeof window.Notification,
        ua: (navigator.userAgent || '').slice(0, 120),
    }

    // 2) 进入「我创建的」歌单详情，验证左栏是否隐藏、详情是否占满整屏
    await router.push('/mymusic/playlist/123456')
    await new Promise(resolve => setTimeout(resolve, 1600))

    const rect = el => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const myMusic = document.querySelector('.my-music')
    const library = document.querySelector('.music-library')
    const libraryView = document.querySelector('.library-view')

    report.route = router.currentRoute.value.fullPath
    report.routeName = String(router.currentRoute.value.name)
    report.myMusicClass = myMusic ? myMusic.className : null
    report.libraryDisplay = library ? getComputedStyle(library).display : 'missing'
    report.libraryView = rect(libraryView)
    report.viewport = { w: innerWidth, h: innerHeight }
    // 详情是否占满：宽度接近视口宽、高度接近可用高度
    report.detailFillsScreen = !!(libraryView
        && libraryView.w >= innerWidth - 2
        && libraryView.h >= innerHeight - 160)

    return JSON.stringify(report)
})()
