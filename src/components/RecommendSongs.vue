<script setup>
import { computed, nextTick, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getHistoryRecommendSongDates } from '../api/playlist';
import { useLibraryStore } from '../store/libraryStore';
import { playAll } from '../utils/player/lazy';
import { noticeOpen } from '../utils/dialog';
import LibrarySongList from './LibrarySongList.vue';

const libraryStore = useLibraryStore();
const route = useRoute();
const router = useRouter();

const historyDates = ref([]);
const selectedDate = ref('');
const loadingDates = ref(false);
const loadingSongs = ref(false);
const initialized = ref(false);
const syncingFromRoute = ref(false);
const dateDropdownOpen = ref(false);
const dropdownRef = ref(null);
const dateOptionRefs = ref([]);
const activeOptionIndex = ref(-1);

const todayDate = computed(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
});

const reachedDailyUpdateTime = computed(() => {
    const now = new Date();
    return now.getHours() >= 6;
});

const todayMissingFromHistory = computed(() => !historyDates.value.includes(todayDate.value));
const shouldInsertTodayOption = computed(() => reachedDailyUpdateTime.value && todayMissingFromHistory.value);

const dateOptions = computed(() => {
    if (!todayDate.value) return historyDates.value;
    if (!shouldInsertTodayOption.value) return historyDates.value;
    return [todayDate.value, ...historyDates.value];
});
const isDateDropdownDisabled = computed(() => loadingDates.value || loadingSongs.value || !dateOptions.value.length);
const selectedDateLabel = computed(() => {
    if (!dateOptions.value.length) return '暂无可选日期';
    if (!selectedDate.value) return '请选择日期';
    return formatDateLabel(selectedDate.value);
});
const activeDateOptionId = computed(() => {
    const activeDate = dateOptions.value[activeOptionIndex.value];
    if (!activeDate) return undefined;
    return getDateOptionId(activeDate);
});

const hasDateOption = date => {
    if (!date) return false;
    return dateOptions.value.includes(date);
};

const getDateOptionId = date => `rec-date-option-${String(date).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

const getDateIndex = date => dateOptions.value.findIndex(item => item == date);

const closeDateDropdown = () => {
    dateDropdownOpen.value = false;
};

const scrollActiveOptionIntoView = () => {
    const activeOption = dateOptionRefs.value[activeOptionIndex.value];
    if (activeOption && typeof activeOption.scrollIntoView == 'function') {
        activeOption.scrollIntoView({ block: 'nearest' });
    }
};

const openDateDropdown = async () => {
    if (isDateDropdownDisabled.value) return;
    dateDropdownOpen.value = true;
    const selectedIndex = getDateIndex(selectedDate.value);
    activeOptionIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
    await nextTick();
    scrollActiveOptionIntoView();
};

const toggleDateDropdown = async () => {
    if (dateDropdownOpen.value) {
        closeDateDropdown();
        return;
    }
    await openDateDropdown();
};

const setDateOptionRef = (element, index) => {
    if (!element) return;
    dateOptionRefs.value[index] = element;
};

const setActiveOptionIndex = index => {
    activeOptionIndex.value = index;
};

const selectDateOption = date => {
    if (!hasDateOption(date) || isDateDropdownDisabled.value) return;
    selectedDate.value = date;
    activeOptionIndex.value = getDateIndex(date);
    closeDateDropdown();
};

const handleClickOutside = event => {
    if (!dateDropdownOpen.value || !dropdownRef.value) return;
    if (!dropdownRef.value.contains(event.target)) {
        closeDateDropdown();
    }
};

const handleDateDropdownKeydown = async event => {
    if (isDateDropdownDisabled.value) return;
    const options = dateOptions.value;
    if (!options.length) return;

    if (event.key == 'Tab') {
        closeDateDropdown();
        return;
    }

    if (event.key == 'Escape') {
        if (!dateDropdownOpen.value) return;
        event.preventDefault();
        closeDateDropdown();
        return;
    }

    if (event.key == 'ArrowDown') {
        event.preventDefault();
        if (!dateDropdownOpen.value) {
            await openDateDropdown();
            return;
        }
        const nextIndex = activeOptionIndex.value + 1 >= options.length ? 0 : activeOptionIndex.value + 1;
        activeOptionIndex.value = nextIndex;
        await nextTick();
        scrollActiveOptionIntoView();
        return;
    }

    if (event.key == 'ArrowUp') {
        event.preventDefault();
        if (!dateDropdownOpen.value) {
            await openDateDropdown();
            return;
        }
        const nextIndex = activeOptionIndex.value - 1 < 0 ? options.length - 1 : activeOptionIndex.value - 1;
        activeOptionIndex.value = nextIndex;
        await nextTick();
        scrollActiveOptionIntoView();
        return;
    }

    if (event.key == 'Enter' || event.key == ' ') {
        event.preventDefault();
        if (!dateDropdownOpen.value) {
            await openDateDropdown();
            return;
        }
        const targetDate = options[activeOptionIndex.value] || options[0];
        if (targetDate) selectDateOption(targetDate);
    }
};

const normalizeDateList = result => {
    const source = result?.data?.dates || result?.data?.dateList || result?.dates || result?.dateList || result?.data || [];
    if (!Array.isArray(source)) return [];
    return source.filter(item => typeof item == 'string');
};

const syncRouteDateQuery = async date => {
    const query = { ...route.query };
    if (!date) delete query.date;
    else query.date = date;
    await router.replace({ path: route.path, query });
};

const loadRecommendSongs = async date => {
    if (!date) {
        libraryStore.librarySongs = [];
        return;
    }

    const shouldUseTodayRecommend = date == todayDate.value && shouldInsertTodayOption.value;

    loadingSongs.value = true;
    try {
        await libraryStore.updateRecommendSongs(shouldUseTodayRecommend ? '' : date);
    } catch (e) {
        noticeOpen('获取推荐歌曲失败', 2);
    } finally {
        loadingSongs.value = false;
    }
};

const applyDateFromRouteQuery = () => {
    const queryDate = typeof route.query.date == 'string' ? route.query.date : '';
    if (queryDate && hasDateOption(queryDate)) {
        selectedDate.value = queryDate;
        return;
    }
    selectedDate.value = dateOptions.value[0] || '';
};

const loadHistoryDates = async () => {
    loadingDates.value = true;
    try {
        const result = await getHistoryRecommendSongDates();
        const dateList = normalizeDateList(result);
        historyDates.value = Array.from(new Set(dateList.filter(date => !!date))).sort((a, b) => b.localeCompare(a));
    } catch (e) {
        historyDates.value = [];
        noticeOpen('获取历史日推日期失败', 2);
    } finally {
        loadingDates.value = false;
    }
};

const formatDateLabel = date => {
    if (date == todayDate.value) return `今天 (${date})`;
    return date;
};

watch(selectedDate, async (date, oldDate) => {
    if (!initialized.value || syncingFromRoute.value || date == oldDate) return;
    await syncRouteDateQuery(date);
    await loadRecommendSongs(date);
});

watch(
    () => route.query.date,
    async () => {
        if (!initialized.value) return;
        const queryDate = typeof route.query.date == 'string' ? route.query.date : '';
        const targetDate = queryDate && hasDateOption(queryDate) ? queryDate : dateOptions.value[0] || '';
        if (targetDate == selectedDate.value) return;

        syncingFromRoute.value = true;
        selectedDate.value = targetDate;
        syncingFromRoute.value = false;
        await loadRecommendSongs(targetDate);
    }
);

watch(dateOptions, options => {
    dateOptionRefs.value = [];
    if (!options.length) {
        activeOptionIndex.value = -1;
        closeDateDropdown();
        return;
    }
    const selectedIndex = getDateIndex(selectedDate.value);
    if (selectedIndex >= 0) {
        activeOptionIndex.value = selectedIndex;
        return;
    }
    if (activeOptionIndex.value < 0 || activeOptionIndex.value >= options.length) {
        activeOptionIndex.value = 0;
    }
});

watch(isDateDropdownDisabled, disabled => {
    if (disabled) closeDateDropdown();
});

onMounted(async () => {
    window.addEventListener('click', handleClickOutside);
    await loadHistoryDates();
    applyDateFromRouteQuery();

    if (typeof route.query.date == 'string' && !hasDateOption(route.query.date)) {
        await syncRouteDateQuery(selectedDate.value);
    }

    await loadRecommendSongs(selectedDate.value);
    initialized.value = true;
});

onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside);
});

onDeactivated(() => {
    closeDateDropdown();
});
</script>

<template>
    <div class="rec-container">
        <div class="rec-header">
            <h1>每日推荐歌曲</h1>
            <span class="rec-subtitle">根据你的音乐口味生成，每天6:00更新</span>
            <div class="rec-option rec-option-date">
                <div class="rec-date-picker" ref="dropdownRef" @keydown="handleDateDropdownKeydown">
                    <button
                        class="rec-date-trigger"
                        :class="{ 'is-open': dateDropdownOpen }"
                        type="button"
                        :disabled="isDateDropdownDisabled"
                        aria-haspopup="listbox"
                        :aria-expanded="dateDropdownOpen ? 'true' : 'false'"
                        @click="toggleDateDropdown"
                    >
                        <span class="rec-date-trigger-label">{{ selectedDateLabel }}</span>
                        <span class="rec-date-trigger-arrow" aria-hidden="true">▾</span>
                    </button>
                    <transition name="rec-date-dropdown">
                        <div v-if="dateDropdownOpen" class="rec-date-dropdown" role="listbox" :aria-activedescendant="activeDateOptionId">
                            <button
                                v-for="(date, index) in dateOptions"
                                :id="getDateOptionId(date)"
                                :key="date"
                                :ref="element => setDateOptionRef(element, index)"
                                class="rec-date-option"
                                :class="{ 'is-active': index == activeOptionIndex, 'is-selected': date == selectedDate }"
                                type="button"
                                role="option"
                                :aria-selected="date == selectedDate ? 'true' : 'false'"
                                @mouseenter="setActiveOptionIndex(index)"
                                @click="selectDateOption(date)"
                            >
                                {{ formatDateLabel(date) }}
                            </button>
                        </div>
                    </transition>
                </div>
            </div>
            <div class="rec-option rec-option-action">
                <button class="play-all" @click="playAll('rec', libraryStore.librarySongs)">播放全部</button>
            </div>
            <span class="rec-status" v-if="loadingSongs">正在加载推荐歌曲...</span>
            <span class="rec-status" v-else-if="!dateOptions.length">暂无可用日推日期</span>
        </div>
        <LibrarySongList :songlist="libraryStore.librarySongs"></LibrarySongList>
    </div>
</template>

<style scoped lang="scss">
.rec-container {
    --rec-text: var(--text);
    --rec-muted: var(--muted-text);
    --rec-border: var(--border);
    --rec-panel: var(--panel);
    --rec-select-bg: rgba(255, 255, 255, 0.35);
    --rec-select-dropdown-bg: #e4f0f0;
    --rec-select-text: #000000;
    --rec-select-active-bg: #000000;
    --rec-select-active-text: #ffffff;
    padding-top: 40px;
    height: 100%;
    overflow: auto;
    &::-webkit-scrollbar {
        display: none;
    }
    h1 {
        margin: 0;
        color: var(--rec-text);
    }
    .rec-subtitle {
        margin: 4px 0;
        font: 14px SourceHanSansCN-Bold;
        color: var(--rec-text);
        display: block;
    }
    .rec-option {
        font: 16px SourceHanSansCN-Bold;
        color: var(--rec-text);
    }
    .rec-option-date {
        margin-top: 16px;
        margin-bottom: 10px;
    }
    .rec-option-action {
        margin-bottom: 20px;
        .play-all {
            border: none !important;
            outline: none;
            box-shadow: none !important;
            -webkit-appearance: none;
            appearance: none;
            background: transparent !important;
            padding: 8px 10px;
            position: relative;
            z-index: 0;
            background-color: transparent !important;
            color: var(--rec-text);
            font: 16px SourceHanSansCN-Bold;
            transition: 0.1s;
            &:focus,
            &:focus-visible {
                outline: none !important;
                box-shadow: none !important;
            }
            &::after {
                content: '';
                width: 0;
                height: 100%;
                background-color: var(--rec-text);
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                transition: 0.2s;
                z-index: -1;
                opacity: 0;
            }
            &:hover {
                cursor: pointer;
                color: var(--bg) !important;
                &::after {
                    width: 100%;
                    opacity: 1;
                }
            }
            &:active {
                transform: scale(1);
            }
        }
    }
    .rec-date-picker {
        font: 14px SourceHanSansCN-Bold;
        display: inline-block;
        position: relative;
        min-width: 220px;
        .rec-date-trigger {
            width: 100%;
            min-width: 220px;
            height: 34px;
            padding: 0 10px;
            border: 1px solid var(--rec-border);
            background-color: var(--rec-select-bg);
            font: 13px SourceHanSansCN-Bold;
            color: var(--rec-select-text) !important;
            outline: none;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-appearance: none;
            appearance: none;
            display: inline-flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            cursor: pointer;
            transition: border-color 0.16s ease;
            &:focus {
                border-color: var(--rec-text);
            }
            &:focus-visible {
                border-color: var(--rec-text);
            }
            &.is-open {
                border-color: var(--rec-text);
            }
            &:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .rec-date-trigger-label {
                flex: 1 1 auto;
                min-width: 0;
                text-align: center;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                color: inherit !important;
            }
            .rec-date-trigger-arrow {
                flex: 0 0 auto;
                transition: transform 0.2s ease;
                color: inherit !important;
            }
            &.is-open .rec-date-trigger-arrow {
                transform: rotate(180deg);
            }
        }
        .rec-date-dropdown {
            width: 100%;
            max-height: 220px;
            overflow-y: auto;
            border: 1px solid var(--rec-border);
            border-top: none;
            background-color: var(--rec-select-dropdown-bg);
            position: absolute;
            left: 0;
            top: calc(100% + 1px);
            z-index: 5;
            border-radius: 0 !important;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
            .rec-date-option {
                width: 100%;
                min-height: 34px;
                border: none;
                padding: 0 10px;
                background-color: var(--rec-select-dropdown-bg);
                background-image: linear-gradient(90deg, var(--rec-select-active-bg), var(--rec-select-active-bg));
                background-repeat: repeat-y;
                background-position: -220px 0;
                color: var(--rec-select-text) !important;
                text-align: center;
                font: 13px SourceHanSansCN-Bold;
                outline: none;
                border-radius: 0 !important;
                box-shadow: none !important;
                -webkit-appearance: none;
                appearance: none;
                display: inline-flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                transition: background-position 0.2s, color 0.2s;
                &:hover,
                &:focus-visible,
                &.is-active,
                &.is-selected {
                    background-position: 0 0;
                    color: var(--rec-select-active-text) !important;
                }
            }
        }
    }
    .rec-date-dropdown-enter-active,
    .rec-date-dropdown-leave-active {
        transition: opacity 0.15s ease, transform 0.15s ease;
        transform-origin: top;
    }
    .rec-date-dropdown-enter-from,
    .rec-date-dropdown-leave-to {
        opacity: 0;
        transform: translateY(-4px);
    }
    .rec-status {
        margin-bottom: 14px;
        display: block;
        font: 13px SourceHanSansCN-Bold;
        color: var(--rec-muted);
    }
}

:global(html.dark .rec-container),
:global(.dark .rec-container) {
    --rec-select-bg: #000000;
    --rec-select-dropdown-bg: #000000;
    --rec-select-text: #ffffff;
    --rec-select-active-bg: #ffffff;
    --rec-select-active-text: #000000;
}
</style>
