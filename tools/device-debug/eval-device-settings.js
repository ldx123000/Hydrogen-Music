(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const router = app.config.globalProperties.$router
    const playerStore = pinia._s.get('playerStore')
    const userStore = pinia._s.get('userStore')

    // 关掉播放器，否则 Home 是 display:none，量什么都是 0
    playerStore.widgetState = true
    await new Promise(resolve => setTimeout(resolve, 400))

    const cookieHasMusicU = document.cookie.split(';').some(item => item.trim().startsWith('MUSIC_U='))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return 'missing'
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
            x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
            display: cs.display, fontSize: cs.fontSize, padding: cs.padding,
        }
    }

    // 进设置页量头像区
    await router.push('/settings')
    await new Promise(resolve => setTimeout(resolve, 1500))

    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        cookieHasMusicU,
        isLogin: typeof window.__hmIsLogin === 'function' ? window.__hmIsLogin() : 'n/a',
        userStoreUser: userStore && userStore.user ? { nickname: userStore.user.nickname, hasAvatar: !!userStore.user.avatarUrl } : null,
        settingsPage: {
            page: rect('.settings-page'),
            userInfo: rect('.settings-page .settings-user-info'),
            userHead: rect('.settings-page .settings-user-info .user-head'),
            userHeadImg: rect('.settings-page .settings-user-info .user-head img'),
            userName: rect('.settings-page .settings-user-info .user-name'),
            logout: rect('.settings-page .settings-user-info .logout'),
        },
        // 顺带看看设置项在窄屏的实际样子
        firstOption: rect('.settings-page .option'),
        optionName: rect('.settings-page .option .option-name'),
    })
})()
