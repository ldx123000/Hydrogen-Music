(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const router = app.config.globalProperties.$router
    const userStore = pinia._s.get('userStore')
    const playerStore = pinia._s.get('playerStore')

    playerStore.widgetState = true
    if (router.currentRoute.value.path !== '/') {
        try { await router.push('/') } catch (_) { }
    }
    userStore.appOptionShow = false
    await new Promise(resolve => setTimeout(resolve, 900))

    const info = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
            rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
            display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
            zIndex: cs.zIndex, position: cs.position, pointerEvents: cs.pointerEvents,
        }
    }

    const report = { route: router.currentRoute.value.fullPath }
    report.userHead = info('.user-head')
    report.header = info('.home-header')
    report.panelBeforeClick = info('.app-option')

    // 点头像
    const head = document.querySelector('.user-head')
    if (head) {
        const b = head.getBoundingClientRect()
        report.headCenter = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
        // 面板打开前，这个坐标上是谁？（判断有没有东西盖住）
        report.elementAtHeadBefore = (() => {
            const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
            return el ? el.tagName + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : null
        })()

        head.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        await new Promise(resolve => setTimeout(resolve, 700))
    }
    report.appOptionShowAfterClick = userStore.appOptionShow
    report.panelAfterClick = info('.app-option')

    // 面板里"设置"那一项是否真的可点
    const option = document.querySelector('.app-option .option')
    if (option) {
        const b = option.getBoundingClientRect()
        const cx = Math.round(b.x + b.width / 2)
        const cy = Math.round(b.y + b.height / 2)
        const hit = document.elementFromPoint(cx, cy)
        report.settingsItemAt = { x: cx, y: cy }
        report.settingsItemHit = hit ? hit.tagName + '.' + String(hit.className || '').split(' ').slice(0, 2).join('.') : null
        report.settingsItemText = option.innerText
        report.settingsItemRect = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }

        option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        await new Promise(resolve => setTimeout(resolve, 900))
        report.routeAfterClickSettings = router.currentRoute.value.fullPath
    } else {
        report.settingsItem = 'missing'
    }

    report.isLoginCookie = document.cookie.split(';').some(c => c.trim().startsWith('MUSIC_U='))
    report.hasAvatarUrl = !!userStore?.user?.avatarUrl

    return JSON.stringify(report)
})()
