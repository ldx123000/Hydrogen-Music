// 注入真实歌曲数据并进入全屏播放页，用于验证移动端播放布局
(async () => {
    const response = await fetch('/api/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6&limit=6')
    const data = await response.json()
    const rawSongs = (data && data.result && data.result.songs) || []
    if (!rawSongs.length) return 'no-songs'

    // 页面里已有真实封面图，直接借一张，避免构造 picUrl
    const domCover = document.querySelector('img[src^="http"]')?.src || ''

    const songs = rawSongs.map(song => ({
        id: song.id,
        name: song.name,
        ar: song.artists || song.ar || [],
        al: {
            id: song.album?.id,
            name: song.album?.name || '',
            picUrl: domCover,
        },
        dt: song.duration || song.dt,
        fee: song.fee,
        type: 'online',
    }))

    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const playerStore = pinia._s.get('playerStore')

    playerStore.songList = songs
    playerStore.currentIndex = 0
    playerStore.songId = songs[0].id
    playerStore.currentMusic = null
    // widgetState=false 即进入全屏播放页
    playerStore.widgetState = false

    // 等 Vue 完成渲染与过渡动画，再测量关键元素的实际盒模型
    await new Promise(resolve => setTimeout(resolve, 1400))

    const rect = selector => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    // 诊断：cover 的最终计算样式，以及各样式表里是否包含目标规则
    const coverEl = document.querySelector('.music-player .player-cover .cover')
    const coverStyle = coverEl ? getComputedStyle(coverEl) : null
    const sheetReport = [...document.styleSheets].map(sheet => {
        const found = []
        try {
            for (const rule of sheet.cssRules) {
                if (rule.cssText && rule.cssText.includes('player-cover .cover')) {
                    found.push(rule.cssText.slice(0, 110))
                }
            }
        } catch (_) { }
        return { href: (sheet.href || 'inline').split('/').pop(), hit: found.length, rules: found }
    }).filter(item => item.hit > 0)

    return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        topbar: rect('.hm-player-topbar'),
        container: rect('.music-player .player-container'),
        cover: rect('.music-player .player-cover .cover'),
        coverImg: rect('.music-player .player-cover .cover img'),
        playBtn: rect('.music-player .control svg'),
        coverComputed: coverStyle ? {
            width: coverStyle.width,
            padding: coverStyle.padding,
            display: coverStyle.display,
        } : null,
        sheetsWithCoverRule: sheetReport,
    })
})()
