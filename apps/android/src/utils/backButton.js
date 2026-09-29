/**
 * Android 返回键 / 全面屏返回手势处理。
 *
 * ── 背景 ──────────────────────────────────────────────────────────────
 * 本项目没有安装 @capacitor/app，也没有覆写 MainActivity.onBackPressed，
 * 于是 Capacitor 的默认行为是「直接 finish() 当前 Activity」——
 * 表现为不管在哪个页面，按一下返回就退出到桌面，完全回不到上一级。
 *
 * 现在原生侧（MainActivity.onBackPressed）只负责把事件派发到页面：
 *     window.dispatchEvent(new CustomEvent('hydrogen:backbutton'))
 * 由本模块决定接下来做什么，原生不擅自退出。
 *
 * ── 处理顺序 ──────────────────────────────────────────────────────────
 *   1. 全屏播放页开着        → 关闭播放页（回到浏览态），不离开当前页面
 *   2. 有可返回的上一条路由  → router.back()
 *   3. 已在根路由            → 真正退出 App（AppControl.exitApp）
 *
 * 说明：第 3 步用原生插件退出；插件不可用时静默忽略，
 * 此时返回键表现为"不响应"，但绝不会误退出。
 */
import { Capacitor } from '@capacitor/core'
import { usePlayerStore } from '../store/playerStore'
import { useOtherStore } from '../store/otherStore'
import { useListenTogetherStore } from '../store/listenTogetherStore'

/**
 * 判定"当前是否处于 App 的根层级"。
 * 首页 / 我的音乐 / 搜索 / 设置 / 塞壬 / 漫游 / 云盘 这些底部 Tab 对应的页面
 * 视为根层级——在这些页面上再按返回就应该退出 App。
 */
const ROOT_ROUTE_NAMES = new Set([
    'homepage',
    'mymusic',
    'search',
    'settings',
    'siren',
    'personalfm',
    'clouddisk',
    'login',
])

/**
 * 详情页 → 父级路由的映射。
 *
 * 为什么不用 router.back()：WebView 的历史里可能夹着 App 内部的重定向
 * （例如启动时恢复上次路由、登录页跳转），直接回退未必落在直觉上的"上一级"。
 * 实测从 /mymusic/playlist/xxx 按返回会一路回到首页，而不是「我的音乐」列表。
 * 所以对已知的详情页显式指定父级，其余情况再退回 router.back()。
 */
const PARENT_ROUTE_OF = {
    playlist: '/mymusic',
    album: '/mymusic',
    artist: '/mymusic',
    recommend: '/',
    dj: '/mymusic',
    // 塞壬的专辑详情，父级是塞壬列表
    sirenAlbum: '/siren',
}

function callExitApp() {
    try {
        const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppControl
        if (plugin && typeof plugin.exitApp === 'function') {
            plugin.exitApp()
            return true
        }
    } catch (_) { }
    // 退路：Cordova 遗留接口（存在就用，不存在就算了）
    try {
        if (window.navigator && window.navigator.app && typeof window.navigator.app.exitApp === 'function') {
            window.navigator.app.exitApp()
            return true
        }
    } catch (_) { }
    return false
}

/**
 * 注册返回键处理。返回一个取消订阅函数。
 *
 * @param {import('vue-router').Router} router
 */
export function initAndroidBackButton(router) {
    // 只在原生 App 里接管；浏览器/桌面端有自己的返回行为，不要干扰
    if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return () => { }

    const playerStore = usePlayerStore()
    const otherStore = useOtherStore()
    const together = useListenTogetherStore()

    const handleBack = () => {
        if (otherStore.addPlaylistShow) {
            otherStore.addPlaylistShow = false
            return
        }
        if (otherStore.contextMenuShow) {
            otherStore.contextMenuShow = false
            return
        }
        if (together.show) {
            together.show = false
            return
        }
        if (playerStore.playlistWidgetShow) {
            playerStore.playlistWidgetShow = false
            return
        }
        // 1) 全屏播放页优先关闭
        if (!playerStore.widgetState) {
            playerStore.widgetState = true
            return
        }

        // 2) 不在根路由 → 回上一级
        const currentName = router.currentRoute.value && router.currentRoute.value.name
        if (currentName && !ROOT_ROUTE_NAMES.has(currentName)) {
            // 已知的详情页：显式跳到它的父级，避免历史里夹着重定向而跳错层级
            const parentPath = PARENT_ROUTE_OF[currentName]
            if (parentPath) {
                router.push(parentPath)
                return
            }
            // 其余页面优先用历史回退，保留正常的浏览轨迹
            if (window.history.length > 1) {
                router.back()
                return
            }
            router.push('/')
            return
        }

        // 3) 已在根层级 → 退出 App
        callExitApp()
    }

    window.addEventListener('hydrogen:backbutton', handleBack)

    return () => {
        window.removeEventListener('hydrogen:backbutton', handleBack)
    }
}
