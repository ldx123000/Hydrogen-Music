(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const userStore = pinia._s.get('userStore')
    const playerStore = pinia._s.get('playerStore')

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
            x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
            display: cs.display, overflow: cs.overflow,
        }
    }

    const report = { viewport: { w: innerWidth, h: innerHeight } }

    // ---------- 1) 头像面板（首页右上角头像点开的东西） ----------
    playerStore.widgetState = true
    const router = app.config.globalProperties.$router
    if (router.currentRoute.value.path !== '/') {
        try { await router.push('/') } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, 900))
    userStore.appOptionShow = true
    await new Promise(resolve => setTimeout(resolve, 800))

    report.avatar = {
        homeUserHead: rect('.home .user-head, .home-header .user-head, .user-head'),
        appOption: rect('.app-option'),
        appOptionText: (document.querySelector('.app-option')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
        appOptionItems: [...document.querySelectorAll('.app-option *')].slice(0, 12).map(el => {
            const b = el.getBoundingClientRect()
            return { cls: el.className || el.tagName, w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }
        }),
    }
    userStore.appOptionShow = false

    // ---------- 2) 波形是否真的在动 ----------
    const readBars = () => [...document.querySelectorAll('.hm-player-wave .visualizer-bar')]
        .slice(0, 8)
        .map(el => el.style.transform || getComputedStyle(el).transform)

    await new Promise(resolve => setTimeout(resolve, 400))
    report.waveBefore = readBars()
    await new Promise(resolve => setTimeout(resolve, 900))
    report.waveAfter = readBars()
    report.waveIsAnimating = JSON.stringify(report.waveBefore) !== JSON.stringify(report.waveAfter)

    // ---------- 3) 播放页里被隐藏的关键控件 ----------
    report.hiddenOnMobile = {
        songControl: rect('.music-player .song-control'),
        playerVolume: rect('.music-player .player-voluem'),
        lyricContainer: rect('.music-player .lyric-container'),
        rightPanel: rect('.music-player .right-panel'),
    }

    return JSON.stringify(report)
})()
