<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { confirmAccountLogout } from '../utils/accountSession'
import { isLogin } from '../utils/authority'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'
import { useIsMobile } from '../composables/useIsMobile'
const router = useRouter()
const userStore = useUserStore()
const playerStore = usePlayerStore()
const isMobile = useIsMobile()

/**
 * 全屏播放页是否打开。判定条件与 App.vue 给 .globalWidget 加 hm-player-mode
 * 时用的完全一致（那里是 musicPlayer 的 v-show="!playerStore.widgetState"）。
 */
const isPlayerPageOpen = computed(() => isMobile.value && !!playerStore.songList && !playerStore.widgetState)

/**
 * 全屏播放页打开时隐藏顶栏头像。
 *
 * 原因：播放页自己有一条 .hm-player-topbar，右上角依次是「歌词」「评论」按钮
 * （`.hm-player-btn`，40px 宽）。而 .user 现在被 Teleport 到 body 顶层、z-index 1400，
 * 已经不再受 .mainWindow 的层叠上下文约束，于是它会**压在这两个按钮上面**：
 *   视口 406px 时实测 —— 评论按钮 x 350..390，头像 x 361..393，正好盖住，
 *   点歌词/评论会命中头像，表现为"歌词按钮被遮住、点不动"。
 * 播放页顶栏已有自己的返回/歌词/评论入口，不需要顶栏头像，所以直接隐藏。
 *
 * 注：因为 .user 不在 #app 内，这里没法用祖先选择器（且 :has() 在
 * Android WebView 上不可靠），只能用响应式控制。
 */
watch(isPlayerPageOpen, (open) => {
    // 进入播放页时顺手收起账户菜单，避免它孤零零地留在播放页上
    if (open && userStore.appOptionShow) userStore.appOptionShow = false
}, { immediate: false })

/**
 * .user 通过 Teleport 挂到了 body（原因见模板里的注释：否则会被顶栏那层
 * rgba(255,255,255,.86) 蒙版盖住）。脱离 #app 之后，mobile.css 里
 * `html[data-hm-mobile='true'] #app .home-header .user` 这类选择器不再命中，
 * 所以移动端的定位改在这里用行内样式给。
 * 桌面端返回空对象，完全不改变原有布局。
 */
const teleportedUserStyle = computed(() => {
    if (!isMobile.value) return {}
    // 与顶栏搜索框**垂直居中对齐**：
    //   实测 --hm-safe-top = 41px，搜索框 y 59..79（中心 69）。
    //   头像容器 32px，若 top 取 safe-top 则中心在 41+16=57，比搜索框高 12px。
    //   加 12px 后中心落在 41+12+16=69，与搜索框中心一致。
    // 用 env() 兜底，避免依赖 --hm-safe-top 是否已同步到 <html>。
    return {
        // 全屏播放页打开时隐藏（否则会压住它右上角的歌词/评论按钮）
        display: isPlayerPageOpen.value ? 'none' : '',
        position: 'fixed',
        top: 'calc(var(--hm-safe-top, env(safe-area-inset-top, 0px)) + 12px)',
        right: 'var(--hm-page-gutter, 14px)',
        left: 'auto',
        zIndex: '1400',
        pointerEvents: 'auto',
    }
})
const HEADER_CENTER = 0.55
const isActive = ref(false)
const routerContainer = ref(null)
const homeLink = ref(null)
const cloudLink = ref(null)
const fmLink = ref(null)
const sirenLink = ref(null)
const musicLink = ref(null)
const trackerLeft = ref(0)
const trackerVisible = ref(false)
const headerOffset = ref(0)
let headerResizeObserver
let headerSearchBaseWidth
let headerMotionFrame
let headerMotionElement

const toSettings = () => {
    router.push('/settings')
}
const handleAuthOptionClick = () => {
    if (userStore.localOnlyMode) return
    if (isLogin()) {
        userStore.appOptionShow = false
        confirmAccountLogout(router)
        return
    }
    userStore.appOptionShow = false
    router.push('/login')
}
const onAfterEnter = () => (isActive.value = true)
const onAfterLeave = () => (isActive.value = false)

const toDom = maybeComp => {
    if (!maybeComp) return null
    return maybeComp.$el ? maybeComp.$el : maybeComp
}

const resolveActiveEl = () => {
    const name = router.currentRoute.value.name
    // Determine active link element by current route
    if (name === 'homepage' && userStore.homePage && homeLink.value) return toDom(homeLink.value)
    if (name === 'clouddisk' && userStore.cloudDiskPage && cloudLink.value) return toDom(cloudLink.value)
    if (name === 'personalfm' && userStore.personalFMPage && fmLink.value) return toDom(fmLink.value)
    if ((name === 'siren' || name === 'sirenAlbum') && userStore.sirenPage && sirenLink.value) return toDom(sirenLink.value)
    // My music or login pages map to My Music tab
    const firstSeg = router.currentRoute.value.fullPath.split('/')[1]
    if ((name === 'mymusic' || firstSeg === 'mymusic' || firstSeg === 'login') && musicLink.value) return toDom(musicLink.value)
    // Fallback to first visible tab
    const firstRef = toDom(homeLink.value) || toDom(cloudLink.value) || toDom(fmLink.value) || toDom(musicLink.value) || toDom(sirenLink.value)
    if (firstRef) return firstRef
    // As last resort, find first anchor inside header-router
    const anchors = routerContainer.value?.querySelectorAll('a')
    return anchors && anchors[0] ? anchors[0] : null
}

const computeTrackerLeft = () => {
    try {
        const el = resolveActiveEl()
        const container = routerContainer.value
        if (!el || !container) {
            trackerVisible.value = false
            return
        }
        // 处于 v-show 隐藏或过渡中时，跳过计算，避免写入错误位置
        if (!container.getClientRects().length || !el.getClientRects().length) return

        const tracker = container.querySelector('.router-tracker')
        const trackWidth = parseFloat(getComputedStyle(tracker).width)
        // 优先使用 offset 以获得更稳定的定位（避免子像素与变换影响）
        let left
        if (el.offsetParent === container || el.offsetParent === container.offsetParent) {
            left = el.offsetLeft + (el.offsetWidth - trackWidth) / 2
        } else {
            // 回退：使用 rect 差值
            const elRect = el.getBoundingClientRect()
            const cRect = container.getBoundingClientRect()
            left = elRect.left - cRect.left + (elRect.width - trackWidth) / 2
        }
        trackerLeft.value = Math.max(0, Math.round(left))
        trackerVisible.value = true
    } catch (_) {
        trackerVisible.value = false
    }
}

const updateTracker = () => {
    nextTick(() => {
        computeTrackerLeft()
        // 在下一帧再次校准，避免字体加载/过渡导致的轻微偏移
        requestAnimationFrame(() => computeTrackerLeft())
    })
}

const computeHeaderOffset = () => {
    const container = routerContainer.value
    const rightGroup = container?.querySelector('.header-router-right')
    if (!container?.getClientRects().length || !rightGroup?.getClientRects().length) return

    const groupWidth = Math.max(container.offsetWidth, rightGroup.offsetLeft + rightGroup.offsetWidth)

    const homeContent = document.querySelector('.home-content')
    const contentStyle = getComputedStyle(homeContent)
    const contentLeftInset = parseFloat(contentStyle.paddingLeft)
    const contentRightInset = parseFloat(contentStyle.paddingRight)
    const search = document.querySelector('.globalWidget .widget-search')
    const searchRect = search?.getClientRects().length ? search.getBoundingClientRect() : null
    if (search?.offsetWidth > 0 && (headerSearchBaseWidth == null || search.offsetWidth < headerSearchBaseWidth)) {
        headerSearchBaseWidth = search.offsetWidth
    }
    const leftRects = ['.globalWidget .widget-title', '.globalWidget .widget-search']
        .map(selector => document.querySelector(selector))
        .filter(element => element?.getClientRects().length)
        .map(element => element.getBoundingClientRect())
    const navGap = parseFloat(getComputedStyle(container.querySelector('.primary-nav')).columnGap)
    const leftEdge = Math.max(contentLeftInset, ...leftRects.map(rect => rect.right))
    const leftBoundary = leftEdge + navGap
    const contentRightBoundary = window.innerWidth - contentRightInset
    const windowControls = document.querySelector('.window-control.windows')
    const windowControlsRect = windowControls?.getClientRects().length ? windowControls.getBoundingClientRect() : null
    const rightBoundary = windowControlsRect ? Math.min(contentRightBoundary, windowControlsRect.left - navGap) : contentRightBoundary
    const centeredLeft = window.innerWidth * HEADER_CENTER - groupWidth / 2
    let searchShift = 0
    if (searchRect && headerSearchBaseWidth != null) {
        const visualizer = document.querySelector('.globalWidget .widget-visualizer')
        const visualizerGap = parseFloat(getComputedStyle(visualizer).marginLeft) || 0
        const restingTransform = -(visualizer.offsetWidth + visualizerGap)
        const currentTransform = new DOMMatrixReadOnly(getComputedStyle(search).transform).m41
        searchShift = Math.max(0, currentTransform - restingTransform) + Math.max(0, search.offsetWidth - headerSearchBaseWidth)
    }
    const responsiveLeft = centeredLeft + searchShift
    const targetLeft = Math.min(Math.max(leftBoundary, responsiveLeft), rightBoundary - groupWidth)
    headerOffset.value = Math.round(targetLeft)
}

const updateHeaderOffset = () => {
    nextTick(() => requestAnimationFrame(() => computeHeaderOffset()))
}

const stopHeaderMotion = () => {
    if (!headerMotionFrame) return
    cancelAnimationFrame(headerMotionFrame)
    headerMotionFrame = 0
}

const updateHeaderDuringMotion = () => {
    computeHeaderOffset()
    headerMotionFrame = requestAnimationFrame(updateHeaderDuringMotion)
}

const startHeaderMotion = event => {
    if (!playerStore.widgetState || event.target !== headerMotionElement || event.propertyName !== 'transform' || headerMotionFrame) return
    headerMotionFrame = requestAnimationFrame(updateHeaderDuringMotion)
}

const finishHeaderMotion = event => {
    if (event.target !== headerMotionElement || event.propertyName !== 'transform') return
    stopHeaderMotion()
    if (playerStore.widgetState) updateHeaderOffset()
}

const observeHeaderMotion = search => {
    if (search === headerMotionElement) return
    stopHeaderMotion()
    headerMotionElement?.removeEventListener('transitionrun', startHeaderMotion)
    headerMotionElement?.removeEventListener('transitionend', finishHeaderMotion)
    headerMotionElement?.removeEventListener('transitioncancel', finishHeaderMotion)
    headerMotionElement = search
    headerSearchBaseWidth = undefined
    headerMotionElement?.addEventListener('transitionrun', startHeaderMotion)
    headerMotionElement?.addEventListener('transitionend', finishHeaderMotion)
    headerMotionElement?.addEventListener('transitioncancel', finishHeaderMotion)
}

const updateHeaderLayout = () => {
    updateHeaderOffset()
    updateTracker()
}

const observeHeaderLayout = () => {
    nextTick(() => {
        const container = routerContainer.value
        const homeContent = document.querySelector('.home-content')
        const search = document.querySelector('.globalWidget .widget-search')
        const windowControls = document.querySelector('.window-control.windows')
        headerResizeObserver.disconnect()
        ;[
            container,
            container?.querySelector('.header-router-right'),
            homeContent,
            document.querySelector('.globalWidget .widget-title'),
            document.querySelector('.globalWidget .widget-visualizer'),
            search,
            windowControls,
        ].filter(Boolean).forEach(element => headerResizeObserver.observe(element))
        observeHeaderMotion(search)
        updateHeaderLayout()
    })
}

onMounted(() => {
    headerResizeObserver = new ResizeObserver(updateHeaderLayout)
    observeHeaderLayout()
    window.addEventListener('resize', updateHeaderLayout)
    // 字体加载完成后再次校准，避免字体替换引起的偏移
    window.addEventListener('focus', updateHeaderLayout)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', updateHeaderLayout)
    window.removeEventListener('focus', updateHeaderLayout)
    headerResizeObserver.disconnect()
    observeHeaderMotion(null)
})

watch(
    () => router.currentRoute.value.fullPath,
    () => updateHeaderLayout()
)
watch(
    () => [userStore.homePage, userStore.cloudDiskPage, userStore.personalFMPage, userStore.sirenPage, userStore.localOnlyMode],
    () => {
        observeHeaderLayout()
    },
    { deep: true }
)
watch(
    () => playerStore.widgetState,
    isWidgetState => {
        if (!isWidgetState) {
            stopHeaderMotion()
            return
        }
        observeHeaderLayout()
    }
)
</script>

<template>
    <div>
        <main>
            <div class="home-header" :style="{ '--header-offset': `${headerOffset}px` }">
                <div
                    class="header-router"
                    :class="{ 'router-closed': !userStore.localOnlyMode && !userStore.homePage && !userStore.cloudDiskPage && !userStore.personalFMPage && !userStore.sirenPage }"
                    ref="routerContainer"
                >
                    <div class="primary-nav">
                        <!-- <div class="logout" @click="userLogout()">退出登录</div> -->
                        <router-link ref="homeLink" class="button-home" :style="{ color: router.currentRoute.value.name == 'homepage' ? 'black' : '#353535' }" to="/" v-if="!userStore.localOnlyMode && userStore.homePage">
                            首页
                        </router-link>
                        <router-link
                            ref="cloudLink"
                            class="button-cloud"
                            :style="{ color: router.currentRoute.value.name == 'clouddisk' ? 'black' : '#353535' }"
                            to="/cloud"
                            v-if="!userStore.localOnlyMode && userStore.cloudDiskPage"
                        >
                            云盘
                        </router-link>
                        <router-link
                            ref="fmLink"
                            class="button-fm"
                            :style="{ color: router.currentRoute.value.name == 'personalfm' ? 'black' : '#353535' }"
                            to="/personalfm"
                            v-if="!userStore.localOnlyMode && userStore.personalFMPage"
                        >
                            私人漫游
                        </router-link>
                        <router-link
                            ref="musicLink"
                            class="button-music"
                            :style="{ color: router.currentRoute.value.name === 'mymusic' || router.currentRoute.value.fullPath.startsWith('/mymusic') ? 'black' : '#353535' }"
                            to="/mymusic"
                        >
                            {{ userStore.localOnlyMode ? '本地音乐' : '我的音乐' }}
                        </router-link>
                    </div>
                    <div class="header-router-right">
                        <router-link
                            ref="sirenLink"
                            class="button-siren"
                            :style="{ color: router.currentRoute.value.fullPath.startsWith('/siren') ? 'black' : '#353535' }"
                            to="/siren"
                            v-if="!userStore.localOnlyMode && userStore.sirenPage"
                        >
                            塞壬唱片
                        </router-link>
                        <!-- ★ .user 通过 Teleport 送到 body 顶层。
                             原因：它原本被包在 .mainWindow 内部，而 .mainWindow 的层叠上下文排在
                             .globalWidget（z-index:1300，一层 rgba(255,255,255,.86) 的顶栏蒙版）
                             之下，且该蒙版在 DOM 中位于 .mainWindow 之后 —— 头像被整块盖住，
                             屏幕上只剩一个"空白白圆"。实测在祖先链内部调 z-index（1310/1400/2000）、
                             去掉 .mainWindow 的 transform、改 .globalWidget 层级，全部无效；
                             只有把节点移出 .mainWindow 才画得出来（移出后实测 sat 1 → 40）。
                             注意：脱离 #app 后 mobile.css 里 `#app .user` 之类的选择器不再命中，
                             相应定位改由本组件 scoped 样式负责。 -->
                        <Teleport to="body">
                        <div class="user" :style="teleportedUserStyle">
                            <div class="user-container">
                                <div class="user-head" @click="userStore.appOptionShow = true">
                                    <!-- 只要有用户信息就显示真实头像。原先要求 isLogin() 为真，
                                         而 isLogin() 只看 MUSIC_U cookie——cookie 丢失时
                                         userStore.user 还在，头像却会退化成灰色小人图标。 -->
                                    <img v-if="userStore.user?.avatarUrl" :src="userStore.user.avatarUrl + '?param=100y100'" alt="" />
                                    <svg v-else t="1672136404205" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5403" width="200" height="200">
                                        <path
                                            d="M511.997 551.041c-218.044 0-399.92 168.61-441.722 392.645l883.45-0.439C911.607 719.432 729.83 551.041 511.997 551.041zM266.597 305.64c0 135.532 109.868 245.401 245.403 245.401 135.53 0 245.403-109.87 245.403-245.4C757.403 170.105 647.53 60.235 512 60.235c-135.535 0-245.403 109.87-245.403 245.406z"
                                            fill="#2c2c2c"
                                            p-id="5404"
                                            data-spm-anchor-id="a313x.7781069.0.i5"
                                            class="selected"
                                        ></path>
                                    </svg>
                                    <div class="img-mask"></div>
                                </div>
                                <transition name="app-option" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
                                    <div class="app-option" :class="{ 'app-option-active': isActive, 'app-option-local-only': userStore.localOnlyMode }" v-show="userStore.appOptionShow">
                                        <div class="option" @click="toSettings()">设置</div>
                                        <div class="option" v-if="!userStore.localOnlyMode" @click="handleAuthOptionClick()">{{ isLogin() ? '退出登录' : '账号登录' }}</div>

                                        <div class="option-style option-style1"></div>
                                        <div class="option-style option-style2"></div>
                                        <div class="option-style option-style3"></div>
                                        <div class="option-style option-style4"></div>
                                    </div>
                                </transition>
                            </div>
                        </div>
                        </Teleport>
                    </div>
                    <div
                        v-show="router.currentRoute.value.name != 'search' && router.currentRoute.value.name != 'settings' && trackerVisible"
                        class="router-tracker"
                        :style="{ left: trackerLeft + 'px' }"
                    ></div>
                </div>
            </div>

            <div class="home-content">
                <router-view v-slot="{ Component }">
                    <keep-alive>
                        <component :is="Component"></component>
                    </keep-alive>
                </router-view>
            </div>
        </main>
    </div>
</template>

<style scoped lang="scss">
main {
    height: 100%;
}

.home-header {
    position: relative;
    z-index: 20;
    margin: 30px 0 20px 0;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    .header-router {
        --nav-gap: clamp(37px, 3vw, 40px);
        position: relative;
        min-height: 27px;
        display: inline-flex;
        align-items: center;
        transform: translateX(var(--header-offset));
        .primary-nav,
        .header-router-right {
            display: flex;
            align-items: center;
        }
        .primary-nav {
            gap: var(--nav-gap);
        }
        .header-router-right {
            position: absolute;
            left: 100%;
            margin-left: var(--nav-gap);
            top: 0;
            bottom: 0;
            white-space: nowrap;
        }
        .primary-nav a,
        .header-router-right a {
            font: 18px SourceHanSansCN-Bold;
            color: black;
            outline: none;
            display: inline-flex;
            align-items: center;
            flex-shrink: 0;
        }
        .primary-nav a {
            margin-right: 0;
        }
        .header-router-right a {
            margin-right: var(--nav-gap);
        }
        .router-tracker {
            width: 14px;
            height: 2px;
            background-color: black;
            position: absolute;
            bottom: 0;
            z-index: 2;
            transition: left 0.3s ease;
        }
        .user {
            position: relative;
            z-index: 999;
            flex-shrink: 0;
            .user-container {
                width: 25px;
                height: 25px;
                position: relative;
                -webkit-app-region: no-drag; /* Avatar and menu should be clickable */
                .user-head {
                    width: 100%;
                    height: 100%;
                    border: 1px solid rgb(0, 0, 0, 0.6);
                    border-radius: 50%;
                    overflow: hidden;
                    position: relative;
                    &:hover {
                        cursor: pointer;
                    }
                    img,
                    svg {
                        width: 100%;
                        height: 100%;
                    }
                    svg {
                        margin-top: 2px;
                    }
                    .img-mask {
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.3);
                        opacity: 0;
                        position: absolute;
                        top: 0;
                        left: 0;
                        transition: 0.15s;
                        &:hover {
                            opacity: 1;
                        }
                    }
                }
                .app-option {
                    --app-option-height: 88px;
                    padding: 0;
                    width: 100px;
                    height: 0;
                    background-image: url('../assets/img/halftone.png');
                    background-size: 120%;
                    background-repeat: repeat;
                    background-color: rgb(20, 20, 20);
                    overflow: hidden;
                    position: absolute;
                    top: 35px;
                    left: -32.5px;
                    z-index: 2001; /* Above dragBar/globalWidget (999) */
                    -webkit-app-region: no-drag; /* Ensure clicks not captured by drag regions */
                    &-active {
                        height: var(--app-option-height);
                        padding: 12px 0;
                    }
                    &-local-only {
                        --app-option-height: 56px;
                    }
                    .option {
                        padding: 8px 14px;
                        font: 14px SourceHanSansCN-Bold;
                        line-height: 16px;
                        color: white;
                        text-align: left;
                        transition: 0.2s;
                        &:hover {
                            cursor: pointer;
                            background-color: rgba(53, 53, 53, 0.7);
                        }
                        &:active {
                            transform: scale(0.95);
                        }
                    }
                    .option-style {
                        width: 4px;
                        height: 4px;
                        background-color: white;
                        position: absolute;
                    }
                    $stylePosition: 4px;
                    .option-style1 {
                        top: $stylePosition;
                        left: $stylePosition;
                    }
                    .option-style2 {
                        top: $stylePosition;
                        right: $stylePosition;
                    }
                    .option-style3 {
                        bottom: $stylePosition;
                        right: $stylePosition;
                    }
                    .option-style4 {
                        bottom: $stylePosition;
                        left: $stylePosition;
                    }
                }
            }
        }
    }
    .router-closed {
        height: 27px;
        margin-left: 0;
    }
}
.home-content {
    padding: 0 45px;
    height: calc(100% + 1px);
    overflow: auto;
    &::-webkit-scrollbar {
        display: none;
    }
}
</style>

<style lang="scss">
.app-option-enter-active {
    animation: app-option-in 0.2s forwards;
}
.app-option-leave-active {
    animation: app-option-in 0.2s reverse;
}
@keyframes app-option-in {
    0% {
        height: 0;
        padding: 0;
    }
    100% {
        height: var(--app-option-height);
        padding: 12px 0;
    }
}

/* ==================================================================
   .user 已被 Teleport 到 body —— 它的整棵子树都需要在这里重新声明。

   为什么必须整棵搬过来（不是一个补丁，而是系统性原因）：
     Teleport 之后 `.user` 不再位于 `.home-header .header-router` 之下，
     于是所有以这条祖先链为前缀的规则全部失效，包括：
       · 本文件 scoped 里的
         `.home-header .header-router .user .user-container .app-option[data-v-*]`
         → 面板丢掉 position:absolute、深色底、halftone 底纹、四个白色角标
         （实测表现：position 变 static、background 变透明、面板跑到屏幕外）
       · mobile.css 里的 `#app .home-header .user*` 一组
       · theme.css 里的 `.dark .home-header .user .user-container .user-head .img-mask`

     注意：data-v 属性本身**不会**丢（Teleport 保留它），失效的原因是
     选择器里的祖先链断了 —— 所以不能靠"再写一条带 data-v 的规则"绕过，
     只能把需要的声明在非 scoped 块里重写一遍。

   桌面端：body > .user 只会命中这一个元素（设置页的 .user 在 #app 内，
   选择器匹配不到），因此桌面外观与改动前一致。
   ================================================================== */

/* ---------- 结构（对应原先 scoped 的 .user / .user-container / .user-head ---------- */
body > .user {
    position: relative;
    z-index: 999;
    flex-shrink: 0;
}

body > .user .user-container {
    position: relative;
    width: 25px;
    height: 25px;
    -webkit-app-region: no-drag;
}

body > .user .user-head {
    width: 100%;
    height: 100%;
    border: 1px solid rgb(0, 0, 0, 0.6);
    border-radius: 50%;
    overflow: hidden;
    position: relative;
}

body > .user .user-head:hover {
    cursor: pointer;
}

body > .user .user-head img,
body > .user .user-head svg {
    width: 100%;
    height: 100%;
}

body > .user .user-head svg {
    margin-top: 2px;
}

/* 深色下遮罩底色（原先在 theme.css 里，带 .home-header 祖先链，同样失效了） */
body > .user .user-head .img-mask {
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    opacity: 0;
    position: absolute;
    top: 0;
    left: 0;
    transition: 0.15s;
}

body > .user .user-head .img-mask:hover {
    opacity: 1;
}

html.dark body > .user .user-head .img-mask {
    background-color: rgba(255, 255, 255, 0.18);
}

html.dark body > .user .user-head {
    border-color: rgba(255, 255, 255, 0.4);
}

/* ---------- 账户菜单面板（原先 scoped，带祖先链） ---------- */
body > .user .app-option {
    --app-option-height: 88px;
    padding: 0;
    width: 100px;
    height: 0;
    background-image: url('../assets/img/halftone.png');
    background-size: 120%;
    background-repeat: repeat;
    background-color: rgb(20, 20, 20);
    overflow: hidden;
    position: absolute;
    top: 35px;
    left: -32.5px;
    z-index: 2001;
    -webkit-app-region: no-drag;
}

body > .user .app-option.app-option-active {
    height: var(--app-option-height);
    padding: 12px 0;
}

body > .user .app-option.app-option-local-only {
    --app-option-height: 56px;
}

body > .user .app-option .option {
    padding: 8px 14px;
    /* 面板宽度由 .app-option 决定，这里显式撑满，避免依赖原先的继承关系 */
    width: 100%;
    box-sizing: border-box;
    font: 14px SourceHanSansCN-Bold;
    line-height: 16px;
    color: white;
    text-align: left;
    transition: 0.2s;
}

body > .user .app-option .option:hover {
    cursor: pointer;
    background-color: rgba(53, 53, 53, 0.7);
}

body > .user .app-option .option:active {
    transform: scale(0.95);
}

/* 四角的白色小方块 —— 这就是那条菜单"好看"的细节之一 */
body > .user .app-option .option-style {
    width: 4px;
    height: 4px;
    background-color: white;
    position: absolute;
}

body > .user .app-option .option-style1 {
    top: 4px;
    left: 4px;
}

body > .user .app-option .option-style2 {
    top: 4px;
    right: 4px;
}

body > .user .app-option .option-style3 {
    bottom: 4px;
    right: 4px;
}

body > .user .app-option .option-style4 {
    bottom: 4px;
    left: 4px;
}

/* ---------- 移动端覆盖（原来在 mobile.css 里，前缀是 #app .home-header） ---------- */
html[data-hm-mobile='true'] body > .user .user-container {
    position: relative;
    width: 32px;
    height: 32px;
}

/* 头像给一个明确的可点区域，别只有 32px 那么难点 */
html[data-hm-mobile='true'] body > .user .user-head {
    width: 36px;
    height: 36px;
    pointer-events: auto;
}

/* 账户菜单：桌面版向左偏移（left:-32.5px）在窄屏会超出右边，改成右对齐 */
html[data-hm-mobile='true'] body > .user .app-option {
    top: 42px;
    left: auto;
    right: 0;
    width: 118px;
    /* 高度必须跟着下面的内边距一起放大，否则内容装不下：
       每个选项 = 15px 行高 + 12px 上下内边距 = 约 40px，两个选项 80px，
       再加面板自身 padding 12px×2 = 104px。若沿用桌面的 88px，
       第二个选项会被 overflow:hidden 裁掉一截，看起来就是"字和框没对齐"。 */
    --app-option-height: 104px;
}

/* 只有一项（本地模式）时同步收窄 */
html[data-hm-mobile='true'] body > .user .app-option.app-option-local-only {
    --app-option-height: 64px;
}

html[data-hm-mobile='true'] body > .user .app-option .option {
    padding: 12px 16px;
    font-size: 15px;
}

/* 深色模式面板底色（原 mobile.css:1036，前缀也是 #app） */
html[data-hm-mobile='true'].dark body > .user .app-option {
    background-color: var(--panel);
    color: var(--text);
}

html[data-hm-mobile='true'].dark body > .user .app-option .option {
    color: var(--text);
}

html[data-hm-mobile='true'].dark body > .user .app-option .option-style {
    background-color: var(--text);
}
</style>
