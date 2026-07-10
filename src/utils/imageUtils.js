import { usePlayerStore } from '../store/playerStore'
import defaultCoverUrl from '../assets/img/default-cover.svg'

let imageFallbackInstalled = false

export const resolveImageUrl = (url) => {
    // 空地址直接回退到默认封面，避免页面出现裂图或空白占位。
    if (!url) return defaultCoverUrl
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    const size = usePlayerStore().coverSize ?? 400
    return url
        .replace('http://', 'https://')
        .replace(/\{size\}/g, size)
        .replace(/([?&])param=\d+y\d+/, `$1param=${size}y${size}`)
        .replace(/^(https?:\/\/[^?]*)$/, `$1?param=${size}y${size}`)
}

export const getDefaultCoverUrl = () => defaultCoverUrl

function handleGlobalImageError(event) {
    const target = event?.target
    if (!(target instanceof HTMLImageElement)) return
    if (target.dataset?.fallbackApplied === '1') return

    target.dataset.fallbackApplied = '1'
    target.src = defaultCoverUrl
}

export function installGlobalImageFallback() {
    if (imageFallbackInstalled || typeof window === 'undefined' || typeof document === 'undefined') return
    // 使用捕获阶段统一接管所有 img 加载失败事件，减少逐个组件补 @error 的成本。
    document.addEventListener('error', handleGlobalImageError, true)
    imageFallbackInstalled = true
}
