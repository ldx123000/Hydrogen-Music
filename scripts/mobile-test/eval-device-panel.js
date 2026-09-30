(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const userStore = pinia._s.get('userStore')
    const panel = document.querySelector('.app-option')
    const head = document.querySelector('.user-head')
    const header = document.querySelector('.home-header')
    return JSON.stringify({
        route: app.config.globalProperties.$router.currentRoute.value.fullPath,
        appOptionShow: userStore.appOptionShow,
        panelDisplay: panel ? getComputedStyle(panel).display : 'missing',
        panelRect: panel ? (() => { const b = panel.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } })() : null,
        userHeadPointerEvents: head ? getComputedStyle(head).pointerEvents : null,
        userHeadRect: head ? (() => { const b = head.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } })() : null,
        headerPointerEvents: header ? getComputedStyle(header).pointerEvents : null,
    })
})()
