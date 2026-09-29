import pinia from '../store/pinia'
import { useCloudStore } from '../store/cloudStore'
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { clearLoginCookies } from './authority'

export async function clearAccountScopedState(options = {}) {
    const { clearCookies = true, clearSessionCookies = false, clearStores = true } = options

    if (clearCookies) {
        clearLoginCookies()
    }

    if (clearSessionCookies && typeof windowApi !== 'undefined' && typeof windowApi.clearNcmApiCookies == 'function') {
        try {
            await windowApi.clearNcmApiCookies()
        } catch (_) {
            // ignore session cookie cleanup failures
        }
    }

    if (!clearStores) return

    const userStore = useUserStore(pinia)
    const cloudStore = useCloudStore(pinia)
    const libraryStore = useLibraryStore(pinia)
    userStore.resetAccountState()
    cloudStore.resetAccountState()
    libraryStore.resetAccountState()
}
