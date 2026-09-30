// 用「仅本地音乐模式」进入 /mymusic，验证歌单页在窄屏下的堆叠布局
// （真实账号登录态无法在自动化环境里获得，这里验证的是布局骨架）
(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const userStore = pinia._s.get('userStore')

    userStore.localOnlyMode = true
    location.hash = '#/mymusic'
    await new Promise(resolve => setTimeout(resolve, 2200))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    const root = document.querySelector('.my-music')

    return JSON.stringify({
        hash: location.hash,
        hasMyMusic: !!root,
        flexDirection: root ? getComputedStyle(root).flexDirection : null,
        myMusic: rect('.my-music'),
        library: rect('.my-music .music-library'),
        libraryType: rect('.library-type'),
        libraryView: rect('.library-view'),
    })
})()
