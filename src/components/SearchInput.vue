<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { noticeOpen } from '../utils/dialog'
import { usePlayerStore } from '../store/playerStore'
import { searchHotDetail, searchSuggest } from '../api/other'

const DEFAULT_ASSIST_LIMIT = 8
const MIN_ASSIST_LIMIT = 1
const SUGGEST_DEBOUNCE_MS = 220
const ASSIST_HOVER_ACTIVATE_DELAY_MS = 140

const playerStore = usePlayerStore()
const router = useRouter()

const searchInput = ref(null)
const assistBodyRef = ref(null)
const searchKeyword = ref('')
const searchShow = ref(false)
const assistVisible = ref(false)
const hotList = ref([])
const suggestList = ref([])
const activeAssistIndex = ref(-1)
const isComposing = ref(false)
const suppressMouseHover = ref(false)
const loadingHot = ref(false)
const loadingSuggest = ref(false)
const hotLoaded = ref(false)
const debounceTimer = ref(null)
const hoverActivateTimer = ref(null)
const hoverPendingIndex = ref(-1)
const requestSeq = ref(0)

function normalizeAssistLimit(value) {
    const num = Number.parseInt(value, 10)
    if (!Number.isFinite(num)) return DEFAULT_ASSIST_LIMIT
    return Math.max(MIN_ASSIST_LIMIT, num)
}

const assistLimit = computed(() => normalizeAssistLimit(playerStore.searchAssistLimit))
const isSuggestMode = computed(() => JTrim(searchKeyword.value) !== '')
const currentList = computed(() => {
    const list = isSuggestMode.value ? suggestList.value : hotList.value
    return list.slice(0, assistLimit.value)
})
const currentTitle = computed(() => (isSuggestMode.value ? 'SUGGESTIONS' : 'HOT SEARCH'))
const currentEmptyText = computed(() => (isSuggestMode.value ? 'NO SUGGESTION' : 'NO HOT SEARCH'))
const currentLoading = computed(() => (isSuggestMode.value ? loadingSuggest.value : loadingHot.value))

function clearDebounceTimer() {
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value)
        debounceTimer.value = null
    }
}

function clearHoverActivateTimer() {
    if (hoverActivateTimer.value) {
        clearTimeout(hoverActivateTimer.value)
        hoverActivateTimer.value = null
    }
}

function clearHoverPendingState() {
    clearHoverActivateTimer()
    hoverPendingIndex.value = -1
}

function resetAssistActiveIndex() {
    clearHoverPendingState()
    activeAssistIndex.value = -1
}

function resetMouseHoverSuppression() {
    suppressMouseHover.value = false
}

function JTrim(s) {
    return String(s || '').replace(/(^\s*)|(\s*$)/g, '')
}

function normalizeSuggestKey(keyword) {
    return JTrim(keyword).toLocaleLowerCase()
}

function appendSuggestItem(list, keywordSet, keyword, type, source) {
    const word = JTrim(keyword)
    if (!word) return
    const normalized = normalizeSuggestKey(word)
    if (!normalized || keywordSet.has(normalized)) return

    keywordSet.add(normalized)
    list.push({
        order: list.length + 1,
        keyword: word,
        type,
        source,
    })
}

function parseWebSuggestItems(data) {
    const result = data?.result || {}
    const groupOrder = Array.isArray(result.order) && result.order.length ? result.order : ['songs', 'artists', 'playlists', 'albums']
    const parsers = {
        songs: {
            list: Array.isArray(result.songs) ? result.songs : [],
            type: 1,
            getKeyword: item => item?.name,
        },
        artists: {
            list: Array.isArray(result.artists) ? result.artists : [],
            type: 100,
            getKeyword: item => item?.name,
        },
        playlists: {
            list: Array.isArray(result.playlists) ? result.playlists : [],
            type: 1000,
            getKeyword: item => item?.name,
        },
        albums: {
            list: Array.isArray(result.albums) ? result.albums : [],
            type: 10,
            getKeyword: item => item?.name,
        },
    }

    const items = []
    for (let i = 0; i < groupOrder.length; i++) {
        const group = parsers[groupOrder[i]]
        if (!group) continue
        for (let j = 0; j < group.list.length; j++) {
            items.push({
                keyword: group.getKeyword(group.list[j]),
                type: group.type,
            })
        }
    }
    return items
}

async function setActiveAssistIndex(index, align = 'nearest') {
    const listLength = currentList.value.length
    if (!assistVisible.value || listLength === 0) {
        resetAssistActiveIndex()
        return
    }

    const normalizedIndex = Math.min(listLength - 1, Math.max(0, index))
    activeAssistIndex.value = normalizedIndex

    await nextTick()

    const body = assistBodyRef.value
    if (!body) return
    const items = body.querySelectorAll('.assist-item')
    const targetItem = items[normalizedIndex]
    if (!targetItem) return

    const clampScrollTop = value => {
        const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight)
        const clamped = Math.min(maxScrollTop, Math.max(0, value))

        if (clamped <= 0.5) return 0
        if (Math.abs(clamped - maxScrollTop) <= 0.5) return maxScrollTop
        return Math.round(clamped)
    }

    const currentTop = body.scrollTop || 0
    const currentBottom = currentTop + body.clientHeight
    const targetTop = targetItem.offsetTop
    const targetBottom = targetTop + targetItem.offsetHeight
    const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight)

    let nextTop = currentTop
    if (align === 'start') {
        nextTop = normalizedIndex === 0 ? 0 : targetTop
    } else if (align === 'end') {
        nextTop = normalizedIndex === listLength - 1 ? maxScrollTop : targetBottom - body.clientHeight
    } else {
        if (targetTop < currentTop) nextTop = targetTop
        else if (targetBottom > currentBottom) nextTop = targetBottom - body.clientHeight
    }

    const normalizedTop = clampScrollTop(nextTop)
    if (Math.abs(normalizedTop - currentTop) > 0.5) {
        body.scrollTop = normalizedTop
    }
}

function moveAssistSelection(direction) {
    if (!assistVisible.value || currentLoading.value || currentList.value.length === 0) return
    clearHoverPendingState()
    suppressMouseHover.value = true

    if (activeAssistIndex.value === -1) {
        const listLength = currentList.value.length
        const nextIndex = direction > 0 ? 0 : listLength - 1
        void setActiveAssistIndex(nextIndex, 'nearest')
        return
    }

    const listLength = currentList.value.length
    let nextIndex = activeAssistIndex.value + direction
    let align = 'nearest'

    if (nextIndex >= listLength) {
        nextIndex = 0
        align = 'start'
    } else if (nextIndex < 0) {
        nextIndex = listLength - 1
        align = 'end'
    }

    void setActiveAssistIndex(nextIndex, align)
}

function handleArrowDown() {
    if (isComposing.value) return
    moveAssistSelection(1)
}

function handleArrowUp() {
    if (isComposing.value) return
    moveAssistSelection(-1)
}

function handleAssistEnter(event) {
    if (isComposing.value) return

    if (assistVisible.value && activeAssistIndex.value >= 0) {
        const item = currentList.value[activeAssistIndex.value]
        if (item) {
            event.preventDefault()
            clickAssistItem(item)
            return
        }
    }

    searchInfo()
}

function handleAssistItemMouseEnter(index) {
    if (suppressMouseHover.value) return
    if (currentLoading.value || currentList.value.length === 0) return
    if (index < 0 || index >= currentList.value.length) return
    if (index === activeAssistIndex.value) {
        clearHoverPendingState()
        return
    }
    if (hoverPendingIndex.value === index) return

    clearHoverActivateTimer()
    hoverPendingIndex.value = index
    hoverActivateTimer.value = setTimeout(() => {
        hoverActivateTimer.value = null
        const canActivate = !suppressMouseHover.value && !currentLoading.value && hoverPendingIndex.value === index && index >= 0 && index < currentList.value.length

        if (canActivate) activeAssistIndex.value = index
        if (hoverPendingIndex.value === index) hoverPendingIndex.value = -1
    }, ASSIST_HOVER_ACTIVATE_DELAY_MS)
}

function handleAssistMouseMove(event) {
    const item = event.target?.closest?.('.assist-item')
    if (suppressMouseHover.value) suppressMouseHover.value = false
    if (!item) return

    const rawIndex = Number.parseInt(item.dataset.index, 10)
    if (Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < currentList.value.length) {
        handleAssistItemMouseEnter(rawIndex)
    }
}

async function fetchHotList() {
    if (hotLoaded.value || loadingHot.value) return

    resetAssistActiveIndex()
    loadingHot.value = true
    try {
        const data = await searchHotDetail()
        const list = Array.isArray(data?.data) ? data.data : []
        hotList.value = list
            .map((item, index) => ({
                order: index + 1,
                keyword: JTrim(item?.searchWord),
                iconType: item?.iconType || 0,
                content: item?.content || '',
            }))
            .filter(item => item.keyword)
        hotLoaded.value = true
    } catch (_) {
        hotList.value = []
        hotLoaded.value = true
    } finally {
        loadingHot.value = false
    }
}

async function fetchSuggestList(keyword) {
    const value = JTrim(keyword)
    if (!value) {
        resetAssistActiveIndex()
        suggestList.value = []
        loadingSuggest.value = false
        return
    }

    resetAssistActiveIndex()
    const seq = ++requestSeq.value
    loadingSuggest.value = true

    try {
        const [mobileResult, webResult] = await Promise.allSettled([
            searchSuggest({
                keywords: value,
                type: 'mobile',
            }),
            searchSuggest({
                keywords: value,
                type: 'web',
            }),
        ])
        if (seq != requestSeq.value) return

        const keywordSet = new Set()
        const list = []

        if (mobileResult.status === 'fulfilled') {
            const allMatch = Array.isArray(mobileResult.value?.result?.allMatch) ? mobileResult.value.result.allMatch : []
            for (let i = 0; i < allMatch.length; i++) {
                appendSuggestItem(list, keywordSet, allMatch[i]?.keyword, allMatch[i]?.type || 0, 'mobile')
            }
        }

        if (webResult.status === 'fulfilled') {
            const webItems = parseWebSuggestItems(webResult.value)
            for (let i = 0; i < webItems.length; i++) {
                appendSuggestItem(list, keywordSet, webItems[i].keyword, webItems[i].type, 'web')
            }
        }

        suggestList.value = list
    } catch (_) {
        if (seq != requestSeq.value) return
        suggestList.value = []
    } finally {
        if (seq == requestSeq.value) loadingSuggest.value = false
    }
}

function handleSearchInput() {
    clearDebounceTimer()
    resetAssistActiveIndex()
    resetMouseHoverSuppression()
    const keyword = JTrim(searchKeyword.value)

    if (!keyword) {
        requestSeq.value += 1
        loadingSuggest.value = false
        suggestList.value = []
        if (assistVisible.value) fetchHotList()
        return
    }

    debounceTimer.value = setTimeout(() => {
        fetchSuggestList(keyword)
    }, SUGGEST_DEBOUNCE_MS)
}

function searchFoucs(event, state) {
    if (state === 'focus') {
        event.target.placeholder = ''
        searchShow.value = true
        assistVisible.value = true
        resetAssistActiveIndex()
        resetMouseHoverSuppression()
        windowApi.unregisterShortcuts()

        if (JTrim(searchKeyword.value)) handleSearchInput()
        else fetchHotList()
    } else {
        clearDebounceTimer()
        resetAssistActiveIndex()
        resetMouseHoverSuppression()
        isComposing.value = false
        windowApi.registerShortcuts()
        event.target.placeholder = 'SEARCH'
        searchShow.value = false
        assistVisible.value = false
    }
}

const searchInfo = (keyword = searchKeyword.value, byAssist = false) => {
    const value = JTrim(keyword)
    if (value != '') {
        searchKeyword.value = value
        router.push({ name: 'search', query: { keywords: value } }).catch(() => {})

        if (byAssist && searchInput.value) searchInput.value.blur()

        if (!playerStore.widgetState) {
            playerStore.widgetState = true
            playerStore.lyricShow = false
            if (playerStore.videoIsPlaying) playerStore.videoIsPlaying = false
        }
    } else {
        noticeOpen('输入不能为空', 2)
    }
}

function clickAssistItem(item) {
    resetAssistActiveIndex()
    resetMouseHoverSuppression()
    searchInfo(item.keyword, true)
}

function displayIndex(index) {
    return String(index + 1).padStart(2, '0')
}

watch(isSuggestMode, () => {
    resetAssistActiveIndex()
})

watch(currentLoading, loading => {
    if (loading) resetAssistActiveIndex()
})

watch(currentList, list => {
    if (!Array.isArray(list) || list.length === 0) {
        resetAssistActiveIndex()
        return
    }

    if (activeAssistIndex.value >= list.length) resetAssistActiveIndex()
})

onUnmounted(() => {
    clearDebounceTimer()
    clearHoverPendingState()
})
</script>

<template>
    <Transition name="fade">
        <div :class="{ 'search-container': true, 'search-container-foucs': searchShow }" v-show="playerStore.playerShow">
            <input
                class="search-input"
                type="text"
                ref="searchInput"
                v-model="searchKeyword"
                @input="handleSearchInput"
                @keydown.down.prevent="handleArrowDown"
                @keydown.up.prevent="handleArrowUp"
                @keydown.enter="handleAssistEnter"
                @compositionstart="isComposing = true"
                @compositionend="isComposing = false"
                @focus="searchFoucs($event, 'focus')"
                @blur="searchFoucs($event, 'blur')"
                placeholder="SEARCH"
                spellcheck="false"
            />
            <div class="search-border search-border1"></div>
            <div class="search-border search-border2"></div>
            <div class="search-border search-border3"></div>
            <div class="search-border search-border4"></div>
            <div class="search-border-2 search-border5"></div>
            <div class="search-border-2 search-border6"></div>
            <div class="search-border-2 search-border7"></div>
            <div class="search-border-2 search-border8"></div>

            <Transition name="assist-fade">
                <div class="search-assist" v-if="assistVisible">
                    <div class="assist-corner assist-corner1"></div>
                    <div class="assist-corner assist-corner2"></div>
                    <div class="assist-corner assist-corner3"></div>
                    <div class="assist-corner assist-corner4"></div>

                    <div class="assist-header">
                        <span class="assist-title">{{ currentTitle }}</span>
                        <span class="assist-count" v-if="currentList.length > 0">[{{ currentList.length }}]</span>
                        <div class="assist-line"></div>
                    </div>

                    <div class="assist-body" :class="{ 'assist-body-keyboard': suppressMouseHover }" ref="assistBodyRef" @mousemove="handleAssistMouseMove">
                        <div class="assist-status" v-if="currentLoading">LOADING...</div>
                        <div class="assist-status" v-else-if="currentList.length === 0">{{ currentEmptyText }}</div>
                        <template v-else>
                            <div
                                class="assist-item"
                                :class="{ 'assist-item-active': index === activeAssistIndex }"
                                v-for="(item, index) in currentList"
                                :key="item.keyword + '-' + index"
                                :data-index="index"
                                @mouseenter="handleAssistItemMouseEnter(index)"
                                @mousedown.prevent
                                @click="clickAssistItem(item)"
                            >
                                <span class="assist-index">{{ displayIndex(index) }}</span>
                                <span class="assist-word">{{ item.keyword }}</span>
                            </div>
                        </template>
                    </div>
                </div>
            </Transition>
        </div>
    </Transition>
</template>

<style scoped lang="scss">
$boderpx: 2 + Px;
$boderPosition: -1px;
.search-container {
    width: 130px;
    height: 20px;
    position: relative;
    bottom: -3px;
    display: flex;
    transition: 0.3s cubic-bezier(0.24, 0.97, 0.59, 1);
    .search-input {
        width: 100%;
        padding: 0 10px;
        color: black;
        border: none;
        border-style: none;
        background: none;
        outline: none;
        text-align: center;
        font: 12px SourceHanSansCN-Bold;
        &::-webkit-input-placeholder {
            font: 12px Geometos;
            color: black;
        }
    }
    .search-border {
        width: 7px;
        height: 7px;
        position: absolute;
    }
    .search-border1 {
        top: 0;
        left: 0;
        border: {
            top: $boderpx solid black;
            left: $boderpx solid black;
        }
    }
    .search-border2 {
        top: 0;
        right: 0;
        border: {
            top: $boderpx solid black;
            right: $boderpx solid black;
        }
    }
    .search-border3 {
        bottom: 0;
        right: 0;
        border: {
            bottom: $boderpx solid black;
            right: $boderpx solid black;
        }
    }
    .search-border4 {
        bottom: 0;
        left: 0;
        border: {
            bottom: $boderpx solid black;
            left: $boderpx solid black;
        }
    }
    .search-border-2 {
        width: 4px;
        height: 4px;
        background-color: black;
        position: absolute;
    }
    .search-border5 {
        top: $boderPosition;
        left: $boderPosition;
    }
    .search-border6 {
        top: $boderPosition;
        right: $boderPosition;
    }
    .search-border7 {
        bottom: $boderPosition;
        right: $boderPosition;
    }
    .search-border8 {
        bottom: $boderPosition;
        left: $boderPosition;
    }

    .search-assist {
        --assist-bg: rgba(183, 208, 216, 0.56);
        --assist-border: rgba(62, 86, 94, 0.26);
        --assist-corner: rgba(38, 52, 58, 0.58);
        --assist-title: rgba(20, 34, 39, 0.92);
        --assist-muted: rgba(45, 64, 71, 0.64);
        --assist-line: rgba(55, 77, 84, 0.28);
        --assist-item-text: rgba(20, 34, 39, 0.9);
        --assist-item-divider: rgba(58, 80, 88, 0.14);
        --assist-hover-fill: rgba(52, 73, 80, 0.72);
        --assist-hover-text: rgba(244, 248, 250, 0.96);
        --assist-status: rgba(45, 64, 71, 0.66);
        --assist-shadow: 0 12px 24px rgba(43, 61, 68, 0.14);

        width: 260px;
        max-height: 364px;
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--assist-bg);
        backdrop-filter: blur(12px);
        border: 1px solid var(--assist-border);
        box-shadow: var(--assist-shadow);
        overflow: hidden;
        z-index: 22;

        .assist-corner {
            width: 7px;
            height: 7px;
            position: absolute;
            border: 1px solid var(--assist-corner);
            z-index: 1;
        }
        .assist-corner1 {
            top: -1px;
            left: -1px;
            border-right: none;
            border-bottom: none;
        }
        .assist-corner2 {
            top: -1px;
            right: -1px;
            border-left: none;
            border-bottom: none;
        }
        .assist-corner3 {
            bottom: -1px;
            right: -1px;
            border-left: none;
            border-top: none;
        }
        .assist-corner4 {
            bottom: -1px;
            left: -1px;
            border-right: none;
            border-top: none;
        }

        .assist-header {
            height: 33px;
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 0 12px;
            border-bottom: 1px solid var(--assist-border);

            .assist-title {
                font:
                    11px Bender-Bold,
                    monospace;
                font-weight: bold;
                letter-spacing: 1.2px;
                color: var(--assist-title);
                white-space: nowrap;
            }
            .assist-count {
                font:
                    10px Bender-Bold,
                    monospace;
                color: var(--assist-muted);
                white-space: nowrap;
            }
            .assist-line {
                height: 1px;
                flex: 1;
                background: linear-gradient(90deg, var(--assist-line), transparent);
            }
        }

        .assist-body {
            max-height: 330px;
            overflow-y: auto;
            overflow-x: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;

            &::-webkit-scrollbar {
                width: 0;
                height: 0;
                display: none;
            }

            .assist-status {
                height: 42px;
                display: flex;
                align-items: center;
                justify-content: center;
                font:
                    11px Bender-Bold,
                    monospace;
                letter-spacing: 1px;
                color: var(--assist-status);
            }

            .assist-item {
                min-height: 32px;
                display: grid;
                grid-template-columns: 34px 1fr;
                align-items: center;
                padding: 0 12px;
                font: 12px SourceHanSansCN-Bold;
                color: var(--assist-item-text);
                transition:
                    color 0.28s ease,
                    background-size 0.32s cubic-bezier(0.22, 1, 0.36, 1);
                background-image: linear-gradient(90deg, var(--assist-hover-fill), var(--assist-hover-fill));
                background-repeat: no-repeat;
                background-size: 0 100%;
                border-bottom: 1px solid var(--assist-item-divider);

                &:hover {
                    cursor: pointer;
                    color: var(--assist-hover-text);
                    background-size: 100% 100%;
                }

                &.assist-item-active {
                    color: var(--assist-hover-text);
                    background-size: 100% 100%;

                    .assist-index {
                        color: currentColor;
                        opacity: 0.82;
                    }
                }

                &:last-child {
                    border-bottom: none;
                }

                .assist-index {
                    font:
                        10px Bender-Bold,
                        monospace;
                    color: var(--assist-muted);
                    letter-spacing: 1px;
                }
                .assist-word {
                    line-height: 1.35;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    text-align: left;
                }
            }

            &.assist-body-keyboard .assist-item:hover:not(.assist-item-active) {
                color: var(--assist-item-text);
                background-size: 0 100%;

                .assist-index {
                    color: var(--assist-muted);
                    opacity: 1;
                }
            }

            &.assist-body-keyboard .assist-item.assist-item-active:hover {
                color: var(--assist-hover-text);
                background-size: 100% 100%;

                .assist-index {
                    color: currentColor;
                    opacity: 0.82;
                }
            }
        }
    }
}
.search-container-foucs {
    width: 160px;
}

:global(html.dark .search-container .search-assist),
:global(.dark .search-container .search-assist) {
    --assist-bg: var(--panel);
    --assist-border: var(--border);
    --assist-corner: var(--text);
    --assist-title: var(--text);
    --assist-muted: var(--muted-text);
    --assist-line: rgba(255, 255, 255, 0.24);
    --assist-item-text: var(--text);
    --assist-item-divider: rgba(255, 255, 255, 0.1);
    --assist-hover-fill: rgba(255, 255, 255, 0.7);
    --assist-hover-text: #0f1114;
    --assist-status: var(--muted-text);
    --assist-shadow: var(--shadow);

    background: var(--assist-bg) !important;
    border-color: var(--assist-border) !important;
    box-shadow: var(--assist-shadow) !important;
    backdrop-filter: blur(10px) !important;
}
:global(html.dark .search-container .search-assist .assist-corner),
:global(.dark .search-container .search-assist .assist-corner) {
    border-color: var(--assist-corner) !important;
}
:global(html.dark .search-container .search-assist .assist-header .assist-line),
:global(.dark .search-container .search-assist .assist-header .assist-line) {
    background: linear-gradient(90deg, var(--assist-line), transparent) !important;
}
:global(html.dark .search-container .search-assist .assist-header .assist-count),
:global(html.dark .search-container .search-assist .assist-body .assist-status),
:global(html.dark .search-container .search-assist .assist-body .assist-item .assist-index),
:global(.dark .search-container .search-assist .assist-header .assist-count),
:global(.dark .search-container .search-assist .assist-body .assist-status),
:global(.dark .search-container .search-assist .assist-body .assist-item .assist-index) {
    color: var(--assist-muted) !important;
}
:global(html.dark .search-container .search-assist .assist-body .assist-item),
:global(.dark .search-container .search-assist .assist-body .assist-item) {
    color: var(--assist-item-text) !important;
    border-bottom-color: var(--assist-item-divider) !important;
    background-image: linear-gradient(90deg, var(--assist-hover-fill), var(--assist-hover-fill)) !important;
}
:global(html.dark .search-container .search-assist .assist-body .assist-item:hover),
:global(html.dark .search-container .search-assist .assist-body .assist-item:hover *),
:global(.dark .search-container .search-assist .assist-body .assist-item:hover),
:global(.dark .search-container .search-assist .assist-body .assist-item:hover *) {
    color: var(--assist-hover-text) !important;
    -webkit-text-fill-color: var(--assist-hover-text) !important;
}
:global(html.dark .search-container .search-assist .assist-body .assist-item.assist-item-active),
:global(html.dark .search-container .search-assist .assist-body .assist-item.assist-item-active *),
:global(.dark .search-container .search-assist .assist-body .assist-item.assist-item-active),
:global(.dark .search-container .search-assist .assist-body .assist-item.assist-item-active *) {
    color: var(--assist-hover-text) !important;
    -webkit-text-fill-color: var(--assist-hover-text) !important;
}
:global(html.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active)),
:global(html.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active) *),
:global(.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active)),
:global(.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active) *) {
    color: var(--assist-item-text) !important;
    -webkit-text-fill-color: var(--assist-item-text) !important;
}
:global(html.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active) .assist-index),
:global(.dark .search-container .search-assist .assist-body.assist-body-keyboard .assist-item:hover:not(.assist-item-active) .assist-index) {
    color: var(--assist-muted) !important;
    -webkit-text-fill-color: var(--assist-muted) !important;
}

.assist-fade-enter-active,
.assist-fade-leave-active {
    transition: 0.18s ease;
}
.assist-fade-enter-from,
.assist-fade-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px);
}

.fade-enter-active,
.fade-leave-active {
    transition: 0.2s;
}

.fade-enter-from,
.fade-leave-to {
    transform: scale(0.9);
    opacity: 0;
}
</style>
