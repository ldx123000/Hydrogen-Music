<script setup>
/**
 * 移动端底部导航
 *
 * 桌面端这些入口在顶部横排（Home.vue 的 header），手机上横向空间不足，
 * 改为底部常驻 Tab，符合手机使用习惯。
 * 显示哪些入口跟随 userStore 的各项开关，与桌面端保持一致。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '../../store/userStore'

const route = useRoute()
const userStore = useUserStore()
const { homePage, cloudDiskPage, personalFMPage, sirenPage, localOnlyMode } = storeToRefs(userStore)

const ICONS = {
    home: 'M12 3.2 3 10.4V21h6.4v-6.2h5.2V21H21V10.4z',
    cloud: 'M6.5 19h11a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 7.2 9.6 4.2 4.2 0 0 0 6.5 19z',
    fm: 'M12 4v10.2M12 4a7.8 7.8 0 0 1 7.8 7.8M12 4a7.8 7.8 0 0 0-7.8 7.8M9.2 14.5a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0M12 20.4v-2.2',
    siren: 'M12 3.5 14 9l5.8.3-4.5 3.7 1.5 5.6L12 15.5 7.2 18.6l1.5-5.6-4.5-3.7L10 9z',
    mine: 'M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zM4.4 20.2c0-3.6 3.4-6 7.6-6s7.6 2.4 7.6 6',
}

// Balance the visible size of the existing tab artwork without changing its paths.
const ICON_VIEW_BOXES = {
    home: '0.18 0.28 23.64 23.64',
    cloud: '-0.84 -0.17 25.52 25.52',
    fm: '1.14 1.34 21.72 21.72',
    siren: '1.62 0.67 20.76 20.76',
    mine: '1.26 1.36 21.48 21.48',
}

const tabs = computed(() => {
    const list = []
    if (!localOnlyMode.value && homePage.value) {
        list.push({ key: 'home', label: '首页', to: '/', match: [] })
    }
    if (!localOnlyMode.value && personalFMPage.value) {
        list.push({ key: 'fm', label: '漫游', to: '/personalfm', match: ['/personalfm'] })
    }
    if (!localOnlyMode.value && cloudDiskPage.value) {
        list.push({ key: 'cloud', label: '云盘', to: '/cloud', match: ['/cloud'] })
    }
    if (!localOnlyMode.value && sirenPage.value) {
        list.push({ key: 'siren', label: '塞壬', to: '/siren', match: ['/siren'] })
    }
    list.push({ key: 'mine', label: localOnlyMode.value ? '本地' : '我的', to: '/mymusic', match: ['/mymusic', '/login'] })
    return list
})

const currentPath = computed(() => route.path)

const isActive = tab => {
    // 「每日推荐」是挂在首页下的二级页面（/recommend），
    // 保持「首页」高亮，这样从首页进去的层级关系才连续。
    if (tab.key === 'home') return currentPath.value === '/' || currentPath.value.startsWith('/recommend')
    return tab.match.some(prefix => currentPath.value.startsWith(prefix))
}
</script>

<template>
    <nav class="hm-tabbar">
        <router-link
            v-for="tab in tabs"
            :key="tab.key"
            class="hm-tab"
            :class="{ 'hm-tab-active': isActive(tab) }"
            :to="tab.to"
        >
            <svg class="hm-tab-icon" :viewBox="ICON_VIEW_BOXES[tab.key]" aria-hidden="true">
                <path :d="ICONS[tab.key]" />
            </svg>
            <span class="hm-tab-label">{{ tab.label }}</span>
        </router-link>
    </nav>
</template>

<style scoped lang="scss">
.hm-tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1200;
    display: flex;
    align-items: stretch;
    height: calc(54px + var(--hm-safe-bottom, 0px));
    padding-bottom: var(--hm-safe-bottom, 0px);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(14px);
    border-top: 1px solid rgba(0, 0, 0, 0.07);
}

.hm-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: #7a7a7a;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.18s;

    &:active {
        opacity: 0.6;
    }
}

.hm-tab-icon {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.hm-tab-label {
    font: 11px SourceHanSansCN-Bold, sans-serif;
    line-height: 1;
}

.hm-tab-active {
    color: #000;
}

/* ⚠️ 深色模式不要写在这里。
   本项目在这个组件里曾经写过
       :global(.dark) .hm-tabbar { ... }
       :global(.dark) .hm-tab { ... }
       :global(.dark) .hm-tab-active { ... }
   看起来合理，但 **Vue 的 scoped 编译器不会把 :global() 规则输出到编译产物**：
   真机实测编译后的样式表中只有 `.hm-tabbar[data-v-b3af0379]`（浅色底），
   那三条深色规则整块消失，于是深色模式下 Tab 栏变成"浅色底 + 浅色字"，
   对比度仅 1.05 —— 而因为是静默丢弃，构建和运行都不报错，极难发现。
   深色覆盖统一写在 src/assets/css/mobile.css 的「深色模式」一节，
   用 `html[data-hm-mobile='true'].dark #app ...` 前缀（优先级也压得住这里）。 */
</style>
