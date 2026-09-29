/**
 * 移动端布局判定
 *
 * 单例响应式：视口宽度或设备朝向变化时自动更新，
 * 并同步到 <html data-hm-mobile>，供 CSS 与组件共同使用。
 * 用宽度判定而非 UA 嗅探，因此在桌面浏览器里把窗口调窄也能得到移动端布局，方便调试。
 */
import { ref } from 'vue'

// 窄屏一律走移动布局；触摸设备放宽到 1024px，覆盖手机横屏与平板
const MOBILE_MEDIA_QUERY = '(max-width: 900px), (pointer: coarse) and (max-width: 1024px)'

export const isMobile = ref(false)

let initialized = false

function apply(matches) {
    isMobile.value = matches
    try {
        document.documentElement.dataset.hmMobile = matches ? 'true' : 'false'
    } catch (_) { }
}

function setup() {
    if (initialized) return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    initialized = true

    const query = window.matchMedia(MOBILE_MEDIA_QUERY)
    apply(query.matches)

    const onChange = event => apply(event.matches)
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange)
    } else if (typeof query.addListener === 'function') {
        query.addListener(onChange)
    }

    // 手机旋转屏幕时视口高度变化，个别浏览器不会触发 matchMedia，补一层保险
    window.addEventListener('orientationchange', () => apply(window.matchMedia(MOBILE_MEDIA_QUERY).matches))
}

setup()

export function useIsMobile() {
    return isMobile
}
