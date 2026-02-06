<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getHistoryRecommendSongDates } from '../api/playlist';
import { useLibraryStore } from '../store/libraryStore';
import { playAll } from '../utils/player';
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

const todayDate = computed(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
});

const hasDateOption = date => {
    if (!date) return false;
    return historyDates.value.includes(date);
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
    loadingSongs.value = true;
    try {
        await libraryStore.updateRecommendSongs(date);
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
    selectedDate.value = historyDates.value[0] || '';
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
        const targetDate = queryDate && hasDateOption(queryDate) ? queryDate : historyDates.value[0] || '';
        if (targetDate == selectedDate.value) return;

        syncingFromRoute.value = true;
        selectedDate.value = targetDate;
        syncingFromRoute.value = false;
        await loadRecommendSongs(targetDate);
    }
);

onMounted(async () => {
    await loadHistoryDates();
    applyDateFromRouteQuery();

    if (typeof route.query.date == 'string' && !hasDateOption(route.query.date)) {
        await syncRouteDateQuery(selectedDate.value);
    }

    await loadRecommendSongs(selectedDate.value);
    initialized.value = true;
});
</script>

<template>
    <div class="rec-container">
        <div class="rec-header">
            <h1>每日推荐歌曲</h1>
            <span class="rec-subtitle">根据你的音乐口味生成，每天6:00更新</span>
            <div class="rec-option rec-option-date">
                <label class="rec-date-picker">
                    <select v-model="selectedDate" :disabled="loadingDates || loadingSongs">
                        <option v-for="date in historyDates" :key="date" :value="date">{{ formatDateLabel(date) }}</option>
                    </select>
                </label>
            </div>
            <div class="rec-option rec-option-action">
                <button class="play-all" @click="playAll('rec', libraryStore.librarySongs)">播放全部</button>
            </div>
            <span class="rec-status" v-if="loadingSongs">正在加载推荐歌曲...</span>
            <span class="rec-status" v-else-if="!historyDates.length">暂无可用日推日期</span>
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
        display: inline-flex;
        align-items: center;
        gap: 10px;
        span {
            color: var(--rec-muted);
        }
        select {
            min-width: 220px;
            height: 34px;
            padding: 0 10px;
            border: 1px solid var(--rec-border);
            background-color: var(--rec-panel);
            font: 13px SourceHanSansCN-Bold;
            color: var(--rec-text);
            outline: none;
            &:focus {
                border-color: var(--rec-text);
            }
            &:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        }
    }
    .rec-status {
        margin-bottom: 14px;
        display: block;
        font: 13px SourceHanSansCN-Bold;
        color: var(--rec-muted);
    }
}
</style>
