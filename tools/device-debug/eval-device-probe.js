(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const userStore = pinia._s.get('userStore')

    const W = innerWidth, H = innerHeight

    // 把截图里的相对坐标换算到当前视口
    const probe = (relX, relY, label) => {
        const x = Math.round(relX * W)
        const y = Math.round(relY * H)
        const el = document.elementFromPoint(x, y)
        if (!el) return { label, x, y, hit: 'null' }
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
            label, x, y,
            hit: el.tagName + '.' + String(el.className || '').split(' ').slice(0, 3).join('.'),
            parent: el.parentElement ? el.parentElement.tagName + '.' + String(el.parentElement.className || '').split(' ').slice(0, 2).join('.') : null,
            rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
            bg: cs.backgroundColor,
            radius: cs.borderRadius,
            color: cs.color,
            text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30),
        }
    }

    const report = { viewport: { w: W, h: H }, route: location.hash }

    // 右上角那一圈（用户说"橙色的圈圈"）
    report.topRight = [
        probe(0.86, 0.073, '右上圆心'),
        probe(0.80, 0.073, '右上偏左'),
        probe(0.93, 0.073, '右上偏右'),
        probe(0.86, 0.055, '右上偏上'),
        probe(0.86, 0.095, '右上偏下'),
    ]

    // 底部那一整条（用户圈的"两个"）
    report.bottomBand = [
        probe(0.26, 0.863, '底部左'),
        probe(0.50, 0.863, '底部中'),
        probe(0.81, 0.861, '底部右1'),
        probe(0.91, 0.861, '底部右2'),
        probe(0.97, 0.860, '底部最右'),
    ]

    // 头像本身：是否渲染了 img、底色是什么
    const head = document.querySelector('.user-head')
    const headImg = head ? head.querySelector('img') : null
    report.avatarElement = head ? {
        rect: (() => { const b = head.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } })(),
        background: getComputedStyle(head).backgroundColor,
        borderRadius: getComputedStyle(head).borderRadius,
        overflow: getComputedStyle(head).overflow,
        childImgExists: !!headImg,
        childImgSrc: headImg ? (headImg.src || '').slice(0, 80) : null,
        childImgVisible: headImg ? getComputedStyle(headImg).display : null,
        innerHTML: head.innerHTML.replace(/\s+/g, ' ').slice(0, 140),
    } : 'no .user-head'

    report.loginState = {
        cookieMUSIC_U: document.cookie.split(';').some(c => c.trim().startsWith('MUSIC_U=')),
        userStoreUser: userStore?.user ? { nickname: userStore.user.nickname, avatarUrl: (userStore.user.avatarUrl || '').slice(0, 70) } : null,
        appOptionShow: userStore?.appOptionShow,
    }

    // 模拟点一下头像，看设置面板能不能出来
    if (head) {
        head.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        await new Promise(resolve => setTimeout(resolve, 600))
        const panel = document.querySelector('.app-option')
        report.afterClickAvatar = {
            appOptionShow: userStore?.appOptionShow,
            panelExists: !!panel,
            panelDisplay: panel ? getComputedStyle(panel).display : 'missing',
            panelRect: panel ? (() => { const b = panel.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } })() : null,
            panelText: panel ? panel.innerText.replace(/\s+/g, ' ').slice(0, 60) : null,
        }
    }

    return JSON.stringify(report)
})()
