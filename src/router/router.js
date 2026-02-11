import { createRouter, createWebHashHistory } from 'vue-router'
import { isLogin } from '../utils/authority'
import { noticeOpen } from '../utils/dialog'
// 路由组件全部切换为懒加载，减小首屏体积
const HomePage = () => import('../views/HomePage.vue')
const CloudDisk = () => import('../views/CloudDisk.vue')
const PersonalFMPage = () => import('../views/PersonalFMPage.vue')
const LoginPage = () => import('../views/LoginPage.vue')
const LoginContent = () => import('../components/LoginContent.vue')
const MyMusic = () => import('../views/MyMusic.vue')
const LibraryDetail = () => import('../components/LibraryDetail.vue')
const RecommendSongs = () => import('../components/RecommendSongs.vue')
const LocalMusicDetail = () => import('../components/LocalMusicDetail.vue')
const SearchResult = () => import('../views/SearchResult.vue')
const Settings = () => import('../views/Settings.vue')
const RadioDetail = () => import('../components/RadioDetail.vue')

import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { useOtherStore } from '../store/otherStore'
const userStore = useUserStore()
const libraryStore = useLibraryStore()
const { updateLibraryDetail } = libraryStore
const { libraryInfo } = storeToRefs(libraryStore)
const localStore = useLocalStore()
const otherStore = useOtherStore()
const hasDifferentLibraryId = (to, from) => String(to?.params?.id || '') != String(from?.params?.id || '')

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
                        if (needReload) await updateLibraryDetail(to.params.id, to.name)
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
                        if(document.getElementById('libraryScroll'))
                            document.getElementById('libraryScroll').scrollTop = 0
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

export default router
