<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { confirmAccountLogout } from '../utils/accountSession'
import { isLogin } from '../utils/authority'
import { useUserStore } from '../store/userStore'
import { usePlayerStore } from '../store/playerStore'

const router = useRouter()
const userStore = useUserStore()
const playerStore = usePlayerStore()
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
                        <div class="user">
                            <div class="user-container">
                                <div class="user-head" @click="userStore.appOptionShow = true">
                                    <img v-if="isLogin() && userStore.user?.avatarUrl" :src="userStore.user.avatarUrl + '?param=100y100'" alt="" />
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
</style>
