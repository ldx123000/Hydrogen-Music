(async () => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    playerStore.widgetState = true
    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bg: cs.backgroundColor }
    }

    const report = {}

    // ---- 顶栏 / 搜索框布局 ----
    if (router.currentRoute.value.path !== '/') { try { await router.push('/') } catch (_) { } }
    await new Promise(resolve => setTimeout(resolve, 900))
    report.topbar = {
        globalWidget: rect('.globalWidget'),
        widgetSearch: rect('.globalWidget .widget-search'),
        userHead: rect('.home-header .user-head'),
        headerPointerEvents: (() => { const e = document.querySelector('.home-header'); return e ? getComputedStyle(e).pointerEvents : null })(),
        avatarHit: (() => {
            const h = document.querySelector('.home-header .user-head')
            if (!h) return null
            const b = h.getBoundingClientRect()
            const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
            return el ? el.tagName + '.' + String(el.className || '').split(' ')[0] : null
        })(),
    }

    // ---- 设置页：三个 Windows 项应当隐藏 ----
    await router.push('/settings')
    await new Promise(resolve => setTimeout(resolve, 1400))
    const optionState = name => {
        const all = [...document.querySelectorAll('.settings-page .option')]
        const hit = all.find(el => (el.querySelector('.option-name')?.innerText || '').trim() === name)
        if (!hit) return 'not-found'
        return { display: getComputedStyle(hit).display, h: Math.round(hit.getBoundingClientRect().height) }
    }
    report.windowsSettings = {
        全局快捷键: optionState('开启全局快捷键'),
        记住窗口大小: optionState('记住窗口大小'),
        退出应用时: optionState('退出应用时'),
        // 对照：应保留的
        主题: optionState('主题'),
        音质选择: optionState('音质选择'),
    }
    report.visibleOptionCount = [...document.querySelectorAll('.settings-page .option')]
        .filter(el => getComputedStyle(el).display !== 'none').length

    // ---- 深色模式 ----
    const darkProbe = () => {
        const g = document.querySelector('.globalWidget')
        const opt = document.querySelector('.settings-page .option')
        const info = document.querySelector('.settings-page .settings-user-info')
        return {
            htmlDark: document.documentElement.classList.contains('dark'),
            pageBg: getComputedStyle(document.querySelector('#app')).backgroundColor,
            topbarBg: g ? getComputedStyle(g).backgroundColor : null,
            optionBg: opt ? getComputedStyle(opt).backgroundColor : null,
            userInfoBg: info ? getComputedStyle(info).backgroundColor : null,
            bodyColor: getComputedStyle(document.body).color,
        }
    }
    report.darkBefore = darkProbe()
    document.documentElement.classList.add('dark')
    await new Promise(resolve => setTimeout(resolve, 700))
    report.darkAfter = darkProbe()

    return JSON.stringify(report)
})()
