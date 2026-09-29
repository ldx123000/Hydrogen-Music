import { ref, watch } from 'vue'

function normalizeSource(source) {
    return typeof source === 'string' ? source.trim() : ''
}

function canPreloadSource(source) {
    return !source.startsWith('data:') && !source.startsWith('blob:')
}

export function useStableImageSource(sourceRef) {
    const displayedSource = ref('')
    let loadToken = 0

    watch(
        sourceRef,
        source => {
            const nextSource = normalizeSource(source)
            const token = ++loadToken

            if (!nextSource) {
                displayedSource.value = ''
                return
            }
            if (nextSource === displayedSource.value) return
            if (!canPreloadSource(nextSource) || typeof Image === 'undefined') {
                displayedSource.value = nextSource
                return
            }

            const image = new Image()
            let settled = false
            const commit = () => {
                if (settled || token !== loadToken) return
                settled = true
                displayedSource.value = nextSource
            }
            const commitAfterDecode = () => {
                if (typeof image.decode === 'function') {
                    image.decode().then(commit).catch(commit)
                } else {
                    commit()
                }
            }

            image.decoding = 'async'
            image.onload = commitAfterDecode
            image.onerror = commit
            image.src = nextSource
            if (image.complete) commitAfterDecode()
        },
        { immediate: true }
    )

    return displayedSource
}
