import { createRouter, createWebHashHistory } from 'vue-router'
import { isLogin } from '../utils/authority'
import { noticeOpen } from '../utils/dialog'
import { ensureDeferredAppInit } from '../utils/initApp'
import { runIdleTask } from '../utils/player/idleTask'
import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { useOtherStore } from '../store/otherStore'

function createRouteLoader(loader) {
    let promise = null
    return () => {
        if (!promise) {
            promise = loader().catch(error => {
                promise = null
                throw error
            })
        }
        return promise
    }
}

// 路由组件保持懒加载，同时支持首屏后空闲预热
const HomePage = createRouteLoader(() => import('../views/HomePage.vue'))
const CloudDisk = createRouteLoader(() => import('../views/CloudDisk.vue'))
const PersonalFMPage = createRouteLoader(() => import('../views/PersonalFMPage.vue'))
const LoginPage = createRouteLoader(() => import('../views/LoginPage.vue'))
const LoginContent = createRouteLoader(() => import('../components/LoginContent.vue'))
const MyMusic = createRouteLoader(() => import('../views/MyMusic.vue'))
const SirenPage = createRouteLoader(() => import('../views/SirenPage.vue'))
const LibraryDetail = createRouteLoader(() => import('../components/LibraryDetail.vue'))
const RecommendSongs = createRouteLoader(() => import('../components/RecommendSongs.vue'))
const LocalMusicDetail = createRouteLoader(() => import('../components/LocalMusicDetail.vue'))
const SearchResult = createRouteLoader(() => import('../views/SearchResult.vue'))
const Settings = createRouteLoader(() => import('../views/Settings.vue'))
const RadioDetail = createRouteLoader(() => import('../components/RadioDetail.vue'))

const userStore = useUserStore()
const libraryStore = useLibraryStore()
const { updateLibraryDetail } = libraryStore
const { libraryInfo } = storeToRefs(libraryStore)
const localStore = useLocalStore()
const otherStore = useOtherStore()
const hasDifferentLibraryId = (to, from) => String(to?.params?.id || '') != String(from?.params?.id || '')
const routeComponentPreloadLoaders = [
    HomePage,
    MyMusic,
    CloudDisk,
    PersonalFMPage,
    LibraryDetail,
    RecommendSongs,
    LocalMusicDetail,
    RadioDetail,
    SearchResult,
    Settings,
    SirenPage,
    LoginPage,
    LoginContent,
]
const routeComponentPreloadBatchSize = 2
let routeComponentPreloadStarted = false

async function preloadRouteComponentBatch(startIndex = 0) {
    if (typeof window === 'undefined' || startIndex >= routeComponentPreloadLoaders.length) return

    await runIdleTask(async () => {
        const batch = routeComponentPreloadLoaders.slice(
            startIndex,
            startIndex + routeComponentPreloadBatchSize
        )
        await Promise.allSettled(batch.map(loader => loader()))
    }, { timeout: 1500, fallbackDelay: 700 })

    void preloadRouteComponentBatch(startIndex + routeComponentPreloadBatchSize)
}

function scheduleRouteComponentPreload() {
    if (routeComponentPreloadStarted || typeof window === 'undefined') return
    routeComponentPreloadStarted = true
    void preloadRouteComponentBatch()
}

const routes = [
    {
        path: '/',
        name: 'homepage',
        component: HomePage,
        beforeEnter: (to, from, next) => {
            if(!userStore.homePage) next({name: 'mymusic'})
            else next()
        },
    },
    {
        path: '/cloud',
        name: 'clouddisk',
        component: CloudDisk,
        beforeEnter: (to, from, next) => {
            if(!userStore.cloudDiskPage) next({name: 'mymusic'})
            else if(isLogin()) next()
            else {next({name: 'login'});noticeOpen("请先登录", 2)}
        },
    },
    {
        path: '/login',
        name: 'login',
        component: LoginPage
    },
    {
        path: '/siren',
        name: 'siren',
        component: SirenPage,
    },
    {
        path: '/siren/album/:id',
        name: 'sirenAlbum',
        component: SirenPage,
    },
    {
        path: '/mymusic',
        name: 'mymusic',
        component: MyMusic,
        children: [
            {
                path: '/mymusic/playlist/:id',
                name: 'playlist',
                component: LibraryDetail,
                beforeEnter: async (to, from, next) => {
                    const needReload = !libraryInfo.value || from.name != 'playlist' || hasDifferentLibraryId(to, from)
                    try {
                        if (needReload) await updateLibraryDetail(to.params.id, to.name, { deferRemaining: true })
                    } finally {
                        next()
                    }
                }
            },
            {
                path: '/mymusic/album/:id',
                name: 'album',
                component: LibraryDetail,
                beforeEnter: async (to, from, next) => {
                    const needReload = !libraryInfo.value || from.name != 'album' || hasDifferentLibraryId(to, from)
                    try {
                        if (needReload) await updateLibraryDetail(to.params.id, to.name)
                    } finally {
                        next()
                    }
                }
            },
            {
                path: '/mymusic/artist/:id',
                name: 'artist',
                component: LibraryDetail,
                beforeEnter: async (to, from, next) => {
                    const needReload = !libraryInfo.value || from.name != 'artist' || hasDifferentLibraryId(to, from)
                    try {
                        if (needReload) await updateLibraryDetail(to.params.id, to.name)
                    } finally {
                        next()
                    }
                }
            },
            {
                path: '/mymusic/playlist/rec',
                name: 'rec',
                component: RecommendSongs,
                beforeEnter: (to, from, next) => {
                    if(isLogin()) {
                        next()
                    } else {
                        noticeOpen("请先登录", 2)
                        next({name: 'login'})
                    }
                }
            },
            {
                path: '/mymusic/dj/:id',
                name: 'dj',
                component: RadioDetail,
            },
            {
                path: '/mymusic/local/files',
                name: 'localFiles',
                component: LocalMusicDetail,
                beforeEnter: (to, from, next) => {
                    if(from.name != 'localFiles') localStore.updateLocalMusicDetail(to.name, to.query)
                    next()
                }
            },
            {
                path: '/mymusic/local/album/:id',
                name: 'localAlbum',
                component: LocalMusicDetail,
                beforeEnter: (to, from, next) => {
                    if(from.name != 'localAlbum') localStore.updateLocalMusicDetail(to.name, null, to.params.id)
                    next()
                }
            },
            {
                path: '/mymusic/local/artist/:id',
                name: 'localArtist',
                component: LocalMusicDetail,
                beforeEnter: (to, from, next) => {
                    if(from.name != 'localArtist') localStore.updateLocalMusicDetail(to.name, null, to.params.id)
                    next()
                }
            },
        ],
        beforeEnter: (to, from, next) => {
            if(isLogin()) next()
            else if((from.name == 'homepage' || from.name == 'search') && to.fullPath != '/mymusic') next()
            else next({name: 'login'})
        },
    },
    {
        path: '/personalfm',
        name: 'personalfm',
        component: PersonalFMPage,
        beforeEnter: (to, from, next) => {
            if(isLogin()) {
                next()
            } else {
                noticeOpen("请先登录", 2)
                next({name: 'login'})
            }
        }
    },
    {
        path: '/login/account',
        name: 'account',
        component: LoginContent
    },
    {
        path: '/library',
        name: 'library',
        component: LibraryDetail
    },
    {
        path: '/search',
        name: 'search',
        component: SearchResult,
        beforeEnter: (to, from, next) => {
            otherStore.getSearchInfo(to.query.keywords)
            next()
        }
    },
    {
        path: '/settings',
        name: 'settings',
        component: Settings,
        beforeEnter: (to, from, next) => {
            next()
        }
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

router.beforeEach((to, from, next) => {
    const fullPath = typeof to?.fullPath === 'string' ? to.fullPath : ''
    const shouldWarmDeferredInit = fullPath.startsWith('/mymusic')
        || fullPath.startsWith('/cloud')
        || fullPath.startsWith('/personalfm')
        || fullPath.startsWith('/siren')

    if (shouldWarmDeferredInit) {
        void ensureDeferredAppInit()
    }

    next()
})

router.afterEach(() => {
    scheduleRouteComponentPreload()
})

export default router
