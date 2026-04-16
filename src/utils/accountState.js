import pinia from '../store/pinia'
import { useCloudStore } from '../store/cloudStore'
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { clearLoginCookies } from './authority'

export async function clearAccountScopedState(options = {}) {
    const { clearCookies = true } = options

    if (clearCookies) {
        clearLoginCookies()
    }

    const userStore = useUserStore(pinia)
    const cloudStore = useCloudStore(pinia)
    const libraryStore = useLibraryStore(pinia)

    userStore.resetAccountState()
    cloudStore.resetAccountState()
    libraryStore.resetAccountState()
}
