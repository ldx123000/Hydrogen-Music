<script setup>
import { ref, computed, onActivated, onDeactivated, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { isLogin } from '../utils/authority';
import { noticeOpen } from '../utils/dialog';
import { subPlaylist } from '../api/playlist';
import { subAlbum } from '../api/album';
import { subArtist } from '../api/artist';
import { formatTime } from '../utils/time';
import { playAll } from '../utils/player/lazy';
import { scheduleAlbumSublistCacheInvalidation, scheduleArtistSublistCacheInvalidation } from '../utils/cacheInvalidation';
import { matchSearchText, normalizeSongFilterKeyword } from '../utils/songFilter';
import LibrarySongList from './LibrarySongList.vue';
import LibraryAlbumList from './LibraryAlbumList.vue';
import LibraryMVList from '../components/LibraryMVList.vue';
import SongFilterInput from './SongFilterInput.vue';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore } from '../store/libraryStore';
import { useLocalStore } from '../store/localStore';
import { storeToRefs } from 'pinia';

const playerStore = usePlayerStore();
const localStore = useLocalStore();
const libraryStore = useLibraryStore();
const { updateLibraryDetail, updateArtistTopSong, updateArtistAlbum, updateArtistsMV, waitForPlaylistHydration, saveDetailScroll, getDetailScroll } = libraryStore;
const { libraryList, libraryInfo, librarySongs, libraryAlbum, libraryMV, playlistUserCreated, artistPageType, listType1, listType2, lastLibraryRoute, lastLibraryScrollTop, restoreLibraryScrollOnActivate, playlistHydration } = storeToRefs(libraryStore);

const router = useRouter();
const isAlbum = ref(false);
const isSinger = ref(false);
const isSongList = ref(false);
const introduceDetailShow = ref(false);
const introduceDetailShowDelay = ref(false);
const songSearchKeyword = ref('');

const canGoBack = ref(false);
const canGoForward = ref(false);
const historyNavPending = ref(false);
const SCROLL_POLICY = {
    NONE: 'none',
    RESTORE_LAST: 'restore-last',
    RESTORE_HISTORY: 'restore-history',
    RESET_TOP: 'reset-top',
};
const pendingScrollPolicy = ref(SCROLL_POLICY.NONE);
const pendingTargetFullPath = ref('');
const normalizeRouteName = routeName => {
    const normalized = String(routeName || '');
    if (!normalized) return '';
    return normalized.startsWith('~') ? normalized.slice(1) : normalized;
};
const isRestorableLibraryRouteName = routeName => {
    const normalized = normalizeRouteName(routeName);
    return normalized == 'playlist' || normalized == 'album' || normalized == 'artist';
};
const getLibraryScroller = () => document.getElementById('libraryScroll');
const notifyLibraryScrollerPositionChanged = scroller => {
    if (!scroller) return;
    const emitScroll = () => scroller.dispatchEvent(new Event('scroll'));
    emitScroll();
    const frame = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
    frame(emitScroll);
};
const setLibraryScrollTop = (targetTop, scroller = null) => {
    const targetScroller = scroller || getLibraryScroller();
    if (!targetScroller) return false;
    const parsedTop = Number(targetTop);
    const normalizedTop = Number.isFinite(parsedTop) ? Math.max(0, parsedTop) : 0;
    targetScroller.scrollTop = normalizedTop;
    notifyLibraryScrollerPositionChanged(targetScroller);
    return true;
};
const readCurrentLibraryScrollTop = () => {
    const scroller = getLibraryScroller();
    if (!scroller) return null;
    const top = Number(scroller.scrollTop);
    if (!Number.isFinite(top)) return 0;
    return Math.max(0, top);
};
const normalizeScrollTop = targetTop => {
    const parsedTop = Number(targetTop);
    if (!Number.isFinite(parsedTop)) return 0;
    return Math.max(0, parsedTop);
};
const waitForAnimationFrame = () => {
    return new Promise(resolve => {
        const frame = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
        frame(() => resolve());
    });
};
const waitForLibraryScroller = async (maxRetry = 8) => {
    for (let i = 0; i < maxRetry; i++) {
        await nextTick();
        const scroller = getLibraryScroller();
        if (scroller) return scroller;
        await waitForAnimationFrame();
    }
    return null;
};
const saveCurrentDetailScroll = routeLike => {
    const route = routeLike || router.currentRoute.value;
    const routeName = normalizeRouteName(route?.name);
    const fullPath = String(route?.fullPath || '');
    if (!isRestorableLibraryRouteName(routeName) || !fullPath) return false;

    const top = readCurrentLibraryScrollTop();
    if (top === null) return false;
    lastLibraryScrollTop.value = top;
    saveDetailScroll(fullPath, top);
    return true;
};
const markHistoryNavigationPending = () => {
    historyNavPending.value = true;
};
const clearPendingScrollPolicy = () => {
    pendingScrollPolicy.value = SCROLL_POLICY.NONE;
    pendingTargetFullPath.value = '';
};
const setPendingScrollPolicy = (policy, targetFullPath) => {
    pendingScrollPolicy.value = policy;
    pendingTargetFullPath.value = targetFullPath || '';
};
const setPendingScrollPolicyForRoute = toRoute => {
    const targetRoute = toRoute || router.currentRoute.value;
    const targetRouteName = normalizeRouteName(targetRoute?.name);
    const targetFullPath = String(targetRoute?.fullPath || '');

    if (!isRestorableLibraryRouteName(targetRouteName)) {
        clearPendingScrollPolicy();
        historyNavPending.value = false;
        return;
    }

    const lastFullPath = String(lastLibraryRoute.value?.fullPath || '');
    const shouldRestoreLast = !!restoreLibraryScrollOnActivate.value && !!lastFullPath && targetFullPath == lastFullPath;
    if (shouldRestoreLast) {
        setPendingScrollPolicy(SCROLL_POLICY.RESTORE_LAST, targetFullPath);
        historyNavPending.value = false;
        return;
    }

    if (historyNavPending.value) {
        setPendingScrollPolicy(SCROLL_POLICY.RESTORE_HISTORY, targetFullPath);
        historyNavPending.value = false;
        restoreLibraryScrollOnActivate.value = false;
        return;
    }

    setPendingScrollPolicy(SCROLL_POLICY.RESET_TOP, targetFullPath);
    historyNavPending.value = false;
    restoreLibraryScrollOnActivate.value = false;
};
const applyScrollTopForRoute = async (targetTop, routeLike = null, options = {}) => {
    const { reapplyAfterHydration = false, skipReapplyIfUserScrolled = true } = options;
    const route = routeLike || router.currentRoute.value;
    const routeName = normalizeRouteName(route?.name);
    const routeId = String(route?.params?.id || '');
    const targetFullPath = String(route?.fullPath || '');
    const normalizedTargetTop = normalizeScrollTop(targetTop);

    const scroller = await waitForLibraryScroller(8);
    const applied = setLibraryScrollTop(normalizedTargetTop, scroller);
    if (!applied) return false;
    const initialAppliedTop = (() => {
        const firstTop = Number(scroller?.scrollTop);
        if (!Number.isFinite(firstTop)) return normalizedTargetTop;
        return Math.max(0, firstTop);
    })();

    if (routeName == 'playlist' && routeId && reapplyAfterHydration) {
        await waitForPlaylistHydration(routeId);
        const currentFullPath = String(router.currentRoute.value?.fullPath || '');
        if (!targetFullPath || currentFullPath != targetFullPath) return false;
        const hydratedScroller = await waitForLibraryScroller(8);
        if (!hydratedScroller) return false;
        const latestFullPath = String(router.currentRoute.value?.fullPath || '');
        if (!targetFullPath || latestFullPath != targetFullPath) return false;

        if (skipReapplyIfUserScrolled) {
            const currentTop = readCurrentLibraryScrollTop();
            if (currentTop !== null && Math.abs(currentTop - initialAppliedTop) > 2) return true;
        }
        setLibraryScrollTop(normalizedTargetTop, hydratedScroller);
    }
    return true;
};
const updateNavState = () => {
    const state = router?.options?.history?.state;
    canGoBack.value = !!state?.back;
    canGoForward.value = !!state?.forward;
};
const resetSongSearch = () => {
    songSearchKeyword.value = '';
};
const resetSongSearchResultScroll = async () => {
    await nextTick();
    setLibraryScrollTop(0);
};
const currentLibraryRouteName = computed(() => normalizeRouteName(router.currentRoute.value.name));
const isPlaylistRoute = computed(() => currentLibraryRouteName.value == 'playlist');
const isAlbumRoute = computed(() => currentLibraryRouteName.value == 'album');
const isArtistTopSongRoute = computed(() => currentLibraryRouteName.value == 'artist' && artistPageType.value == 0);
const isArtistAlbumRoute = computed(() => currentLibraryRouteName.value == 'artist' && artistPageType.value == 1);
const isArtistMVRoute = computed(() => currentLibraryRouteName.value == 'artist' && artistPageType.value == 2);
const showSongSearch = computed(() => isPlaylistRoute.value || isAlbumRoute.value || isArtistTopSongRoute.value || isArtistAlbumRoute.value || isArtistMVRoute.value);
const normalizedSongSearchKeyword = computed(() => normalizeSongFilterKeyword(songSearchKeyword.value));
const hasSongSearchKeyword = computed(() => normalizedSongSearchKeyword.value !== '');
const songFilterEntries = computed(() => {
    const songs = Array.isArray(librarySongs.value) ? librarySongs.value : [];
    return songs
        .map((song, sourceIndex) => ({ song, sourceIndex }))
        .filter(entry => !showSongSearch.value || !hasSongSearchKeyword.value || matchSearchText(libraryStore.getSongSearchText(entry.song, `song-${entry.sourceIndex}`), normalizedSongSearchKeyword.value));
});
const visibleLibrarySongs = computed(() => {
    if (!showSongSearch.value) return Array.isArray(librarySongs.value) ? librarySongs.value : [];
    return songFilterEntries.value.map(entry => entry.song);
});
const visibleLibrarySourceIndexes = computed(() => {
    if (!showSongSearch.value || !hasSongSearchKeyword.value) return null;
    return songFilterEntries.value.map(entry => entry.sourceIndex);
});
const visibleArtistAlbums = computed(() => {
    const albums = Array.isArray(libraryAlbum.value) ? libraryAlbum.value : [];
    if (!isArtistAlbumRoute.value || !hasSongSearchKeyword.value) return albums;
    return albums.filter((album, index) => matchSearchText(libraryStore.getAlbumSearchText(album, `album-${index}`), normalizedSongSearchKeyword.value));
});
const visibleArtistMVs = computed(() => {
    const mvs = Array.isArray(libraryMV.value) ? libraryMV.value : [];
    if (!isArtistMVRoute.value || !hasSongSearchKeyword.value) return mvs;
    return mvs.filter((mv, index) => matchSearchText(libraryStore.getMVSearchText(mv, `mv-${index}`), normalizedSongSearchKeyword.value));
});
const currentSearchResultCount = computed(() => {
    if (isArtistAlbumRoute.value) return visibleArtistAlbums.value.length;
    if (isArtistMVRoute.value) return visibleArtistMVs.value.length;
    return visibleLibrarySongs.value.length;
});
const playlistHydrationLoaded = computed(() => {
    const loaded = Number(playlistHydration.value?.loaded || 0);
    return Number.isFinite(loaded) ? Math.max(0, loaded) : 0;
});
const playlistHydrationTotal = computed(() => {
    const total = Number(playlistHydration.value?.total || 0);
    const normalizedTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
    return Math.max(normalizedTotal, playlistHydrationLoaded.value);
});
const showSongSearchEmpty = computed(() => showSongSearch.value && hasSongSearchKeyword.value && currentSearchResultCount.value == 0);
const isSongSearchLoading = computed(() => isPlaylistRoute.value && showSongSearchEmpty.value && playlistHydration.value?.status == 'loading');
const isSongSearchFailed = computed(() => isPlaylistRoute.value && showSongSearchEmpty.value && playlistHydration.value?.status == 'failed');
const songSearchEmptyTitle = computed(() => {
    if (isSongSearchLoading.value) return '正在加载更多歌曲...';
    if (isArtistAlbumRoute.value) return '未找到相关专辑';
    if (isArtistMVRoute.value) return '未找到相关MV';
    return '未找到相关歌曲';
});
const songSearchEmptyDescription = computed(() => {
    if (isSongSearchLoading.value) return `已加载 ${playlistHydrationLoaded.value} / ${playlistHydrationTotal.value} 首歌曲`;
    if (isSongSearchFailed.value) return '剩余歌曲加载失败，结果可能不完整';
    return '';
});

const applyPendingScrollPolicy = async () => {
    const currentRoute = router.currentRoute.value;
    const currentRouteName = normalizeRouteName(currentRoute?.name);
    const currentFullPath = String(currentRoute?.fullPath || '');
    if (!isRestorableLibraryRouteName(currentRouteName)) return;

    const lastFullPath = String(lastLibraryRoute.value?.fullPath || '');
    const shouldRestoreLast = !!restoreLibraryScrollOnActivate.value && !!lastFullPath && currentFullPath == lastFullPath;
    const activePolicy = shouldRestoreLast ? SCROLL_POLICY.RESTORE_LAST : pendingScrollPolicy.value;
    if (activePolicy == SCROLL_POLICY.NONE) return;

    if (pendingTargetFullPath.value && currentFullPath != pendingTargetFullPath.value && activePolicy != SCROLL_POLICY.RESTORE_LAST) return;

    if (activePolicy == SCROLL_POLICY.RESTORE_LAST) {
        const restored = await applyScrollTopForRoute(lastLibraryScrollTop.value, currentRoute, {
            reapplyAfterHydration: true,
            skipReapplyIfUserScrolled: true,
        });
        if (!restored) return;
        restoreLibraryScrollOnActivate.value = false;
        clearPendingScrollPolicy();
        return;
    }

    if (activePolicy == SCROLL_POLICY.RESTORE_HISTORY) {
        const rememberedTop = getDetailScroll(currentFullPath);
        const targetTop = rememberedTop === null ? 0 : rememberedTop;
        const restored = await applyScrollTopForRoute(targetTop, currentRoute, {
            reapplyAfterHydration: rememberedTop !== null && targetTop > 0,
            skipReapplyIfUserScrolled: true,
        });
        if (!restored) return;
        clearPendingScrollPolicy();
        return;
    }

    if (activePolicy == SCROLL_POLICY.RESET_TOP) {
        const reset = await applyScrollTopForRoute(0, currentRoute, {
            reapplyAfterHydration: false,
        });
        if (!reset) return;
        clearPendingScrollPolicy();
    }
};

libraryTypeCheck(router.currentRoute.value.name);

onBeforeRouteLeave((to, from, next) => {
    saveCurrentDetailScroll(from);
    resetSongSearch();
    const toRouteName = normalizeRouteName(to.name);
    if (!isRestorableLibraryRouteName(toRouteName)) {
        historyNavPending.value = false;
        clearPendingScrollPolicy();
    }
    if (to.name == 'mymusic') {
        if (!isLogin()) router.push('/login');
        libraryInfo.value = null;
    }
    libraryTypeCheck(to.name);
    next();
});

onBeforeRouteUpdate(async (to, from, next) => {
    saveCurrentDetailScroll(from);
    resetSongSearch();
    setPendingScrollPolicyForRoute(to);

    const normalizedToName = normalizeRouteName(to.name);
    const detailLoadOptions = normalizedToName == 'playlist' ? { deferRemaining: true } : {};
    await updateLibraryDetail(to.params.id, normalizedToName, detailLoadOptions);
    libraryTypeCheck(to.name);
    artistPageType.value = 0;
    libraryAlbum.value = null;
    libraryMV.value = null;
    next();
    await applyPendingScrollPolicy();
});

const routerChange = operation => {
    if (operation) {
        if (!canGoForward.value) return;
        markHistoryNavigationPending();
        router.forward();
    } else {
        if (!canGoBack.value) return;
        markHistoryNavigationPending();
        router.back();
    }
};

function libraryTypeCheck(pageName) {
    isAlbum.value = false;
    isSinger.value = false;
    isSongList.value = false;
    if (pageName == 'playlist' || pageName == '~playlist') {
        isSongList.value = true;
    } else if (pageName == 'album' || pageName == '~album') {
        isSongList.value = true;
        isAlbum.value = true;
    } else if (pageName == 'artist' || pageName == '~artist') {
        isSinger.value = true;
        if (artistPageType.value == 0) isSongList.value = true;
    }
}

//计算歌单总时长(分)
const totalTime = computed(() => {
    let total = 0;
    const songList = librarySongs.value || [];
    songList.forEach(song => {
        total += song.dt;
    });
    return Math.round(total / 1000 / 60);
});

//歌单日期
const createTime = computed(() => {
    return formatTime(libraryInfo.value.createTime || libraryInfo.value.publishTime, 'YYYY-MM-DD');
});

//如果是歌手页面，可以更换下面的类型
const changeType = type => {
    if (type == 0) {
        isSongList.value = true;
        updateArtistTopSong(libraryInfo.value.id);
    }
    if (type == 1) {
        isSongList.value = false;
        updateArtistAlbum(libraryInfo.value.id);
    }
    if (type == 2) {
        isSongList.value = false;
        updateArtistsMV(libraryInfo.value.id);
    }
    artistPageType.value = type;
};

//歌单、专辑、歌手的收藏(极其降智的写法,主要问题是接口缓存的问题,使用时间戳请求数据后他不会自己更新最新缓存，所以设置了2分钟的无缓存时间)
const subHandle = id => {
    let type1 = null;
    let type2 = null;
    if (!isAlbum.value && !isSinger.value) {
        (type1 = 0), (type2 = 1);
    }
    if (isAlbum.value) {
        scheduleAlbumSublistCacheInvalidation();
        (type1 = 1), (type2 = 0);
    }
    if (isSinger.value) {
        (type1 = 1), (type2 = 1);
        scheduleArtistSublistCacheInvalidation();
    }

    if (libraryInfo.value.followed) {
        libraryInfo.value.followed = false;
        if (listType1.value == type1 && listType2.value == type2)
            libraryList.value.splice(
                (libraryList.value || []).findIndex(item => item.id === id),
                1
            );
        return;
    }
    if (!libraryInfo.value.followed) {
        libraryInfo.value.followed = true;
        if (listType1.value == type1 && listType2.value == type2) libraryList.value.unshift(libraryInfo.value);
        return;
    }
};

const librarySub = id => {
    let params = {
        id: id,
        t: libraryInfo.value.followed ? 0 : 1,
        timestamp: Date.now(),
    };
    if (isSinger.value) {
        subArtist(params).then(result => {
            if (result.code == 200) {
                subHandle(id);
                if (params.t == 1) noticeOpen('收藏成功', 2);
                else noticeOpen('已取消收藏', 2);
            } else {
                noticeOpen('收藏/取消收藏失败', 2);
            }
        });
    }
    if (isAlbum.value) {
        subAlbum(params).then(result => {
            if (result.code == 200) {
                subHandle(id);
                if (params.t == 1) noticeOpen('收藏成功', 2);
                else noticeOpen('已取消收藏', 2);
            } else {
                noticeOpen('收藏/取消收藏失败', 2);
            }
        });
    }
    if (!isAlbum.value && !isSinger.value) {
        let params = {
            id: id,
            t: libraryInfo.value.followed ? 2 : 1,
            timestamp: Date.now(),
        };
        subPlaylist(params).then(result => {
            if (result.code == 200) {
                subHandle(id);
                if (params.t == 1) noticeOpen('收藏成功', 2);
                else noticeOpen('已取消收藏', 2);
            } else {
                noticeOpen('收藏/取消收藏失败', 2);
            }
        });
    }
};

//查看并跳转歌手页面
const checkArtist = artistId => {
    router.push('/mymusic/artist/' + artistId);
    playerStore.forbidLastRouter = true;
};
const waitCurrentPlaylistHydration = async () => {
    if (normalizeRouteName(router.currentRoute.value.name) != 'playlist') return;
    if (!libraryInfo.value || !libraryInfo.value.id) return;
    await waitForPlaylistHydration(libraryInfo.value.id);
};

const playAllSafe = async () => {
    await waitCurrentPlaylistHydration();
    playAll('other', librarySongs.value || []);
};

//下载本歌单/专辑全部歌曲
const downloadAll = async () => {
    await waitCurrentPlaylistHydration();
    localStore.updateDownloadList(librarySongs.value || []);
};

watch(
    () => songSearchKeyword.value,
    () => {
        if (!showSongSearch.value) return;
        void resetSongSearchResultScroll();
    }
);

watch(
    () => router.currentRoute.value.fullPath,
    async () => {
        await nextTick();
        updateNavState();
        if (pendingScrollPolicy.value == SCROLL_POLICY.NONE) setPendingScrollPolicyForRoute(router.currentRoute.value);
        await applyPendingScrollPolicy();
    },
    { immediate: true }
);

onActivated(async () => {
    updateNavState();
    if (pendingScrollPolicy.value == SCROLL_POLICY.NONE) setPendingScrollPolicyForRoute(router.currentRoute.value);
    await applyPendingScrollPolicy();
});
onMounted(async () => {
    window.addEventListener('popstate', markHistoryNavigationPending);
    if (pendingScrollPolicy.value == SCROLL_POLICY.NONE) setPendingScrollPolicyForRoute(router.currentRoute.value);
    await applyPendingScrollPolicy();
});
onDeactivated(() => {
    saveCurrentDetailScroll(router.currentRoute.value);
});
onBeforeUnmount(() => {
    window.removeEventListener('popstate', markHistoryNavigationPending);
});

const onAfterEnter = () => (introduceDetailShowDelay.value = true);
const onAfterLeave = () => (introduceDetailShowDelay.value = false);
</script>

<template>
    <div class="library-detail" v-if="libraryInfo">
        <div class="view-control">
            <svg
                t="1669039513804"
                @click="routerChange(0)"
                class="router-last"
                :class="{ 'router-disabled': !canGoBack }"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="1053"
                width="200"
                height="200"
            >
                <path d="M716.608 1010.112L218.88 512.384 717.376 13.888l45.248 45.248-453.248 453.248 452.48 452.48z" p-id="1054"></path>
            </svg>
            <svg
                t="1669039531646"
                @click="routerChange(1)"
                class="router-next"
                :class="{ 'router-disabled': !canGoForward }"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="1207"
                width="200"
                height="200"
            >
                <path d="M264.896 1010.112l497.728-497.728L264.128 13.888 218.88 59.136l453.248 453.248-452.48 452.48z" p-id="1208"></path>
            </svg>
        </div>
        <div class="library-introduce">
            <div class="introduce">
                <div class="introduce-img" :class="{ 'introduce-img-circle': isSinger }">
                    <img :src="(libraryInfo.coverImgUrl || libraryInfo.blurPicUrl || libraryInfo.img1v1Url) + '?param=300y300'" alt="" />
                </div>
                <div class="introduce-info">
                    <span class="introduce-name">{{ libraryInfo.name }}</span>
                    <div class="info-other">
                        <div class="introduce-author">
                            <span class="author" v-if="libraryInfo.creator">{{ libraryInfo.creator.nickname }}</span>
                            <span class="author" @click="checkArtist(artist.id)" v-for="(artist, index) in libraryInfo.artists">
                                {{ artist.name }}{{ index == libraryInfo.artists.length - 1 ? '' : '/' }}
                            </span>
                            <span class="author" v-if="libraryInfo.trans">{{ libraryInfo.trans }}&nbsp;&nbsp;</span>
                            <span class="author" v-for="(alia, index) in libraryInfo.alias">{{ alia }}{{ index == libraryInfo.alias.length - 1 ? '' : ' · ' }}</span>
                        </div>
                        <span class="introduce-num" v-if="!isSinger">共{{ libraryInfo.trackCount || libraryInfo.size }}首 - {{ totalTime }}分钟</span>
                        <span class="introduce-num" v-if="isSinger">{{ libraryInfo.musicSize }}首歌 · {{ libraryInfo.albumSize }}张专辑 · {{ libraryInfo.mvSize }}个MV</span>
                        <div class="library-operation">
                            <template v-if="isLogin()">
                                <div class="operation-collection operation-item" v-show="(playlistUserCreated || []).findIndex(song => song.id == libraryInfo.id) == -1" @click="librarySub(libraryInfo.id)">
                                    <svg
                                        v-show="!libraryInfo.followed"
                                        t="1669112450805"
                                        class="collect-icon"
                                        viewBox="0 0 1024 1024"
                                        version="1.1"
                                        xmlns="http://www.w3.org/2000/svg"
                                        p-id="2261"
                                        width="200"
                                        height="200"
                                    >
                                        <path d="M98 480.86h829.99v63.79H98z" p-id="2262"></path>
                                        <path d="M481.48 98.15h63.79V927h-63.79z" p-id="2263"></path>
                                    </svg>
                                    <svg
                                        v-show="libraryInfo.followed"
                                        t="1670744716630"
                                        class="collected-icon"
                                        viewBox="0 0 1024 1024"
                                        version="1.1"
                                        xmlns="http://www.w3.org/2000/svg"
                                        p-id="2167"
                                        width="200"
                                        height="200"
                                    >
                                        <path
                                            d="M392.533333 806.4L85.333333 503.466667l59.733334-59.733334 247.466666 247.466667L866.133333 213.333333l59.733334 59.733334L392.533333 806.4z"
                                            fill="#444444"
                                            p-id="2168"
                                        ></path>
                                    </svg>
                                    <span>{{ libraryInfo.followed ? '已收藏' : '收藏' }}</span>
                                </div>
                                <div class="operation-download operation-item" v-if="!isSinger">
                                    <svg
                                        t="1669030443895"
                                        class="download-icon"
                                        viewBox="0 0 1024 1024"
                                        version="1.1"
                                        xmlns="http://www.w3.org/2000/svg"
                                        p-id="10347"
                                        width="200"
                                        height="200"
                                        data-v-7f63928d=""
                                    >
                                        <path
                                            d="M921.6 563.2c-9.6-9.6-25.6-9.6-35.2 0L544 896l0-822.4c0-12.8-9.6-22.4-25.6-22.4s-25.6 9.6-25.6 22.4L492.8 896l-342.4-339.2c-9.6-9.6-25.6-9.6-35.2 0-9.6 9.6-9.6 22.4 0 32l384 377.6c6.4 6.4 12.8 6.4 19.2 6.4 0 0 0 0 0 0 3.2 0 3.2 0 6.4 0 0 0 0 0 3.2 0 3.2 0 6.4-3.2 9.6-6.4l380.8-371.2C931.2 588.8 931.2 572.8 921.6 563.2z"
                                            p-id="10348"
                                            data-v-7f63928d=""
                                        ></path>
                                    </svg>
                                    <span @click="downloadAll()">下载</span>
                                </div>
                            </template>
                            <div class="operation-search" v-if="showSongSearch">
                                <SongFilterInput v-model="songSearchKeyword" compact show-icon placeholder="SEARCH"></SongFilterInput>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="introduce-other">
                <div class="introduce-1" v-show="!isSinger">{{ isAlbum ? '发行时间' : '创建时间' }} {{ createTime }}</div>
                <div class="introduce-1" v-if="libraryInfo.follow">{{ libraryInfo.follow.fansCnt }} 已关注</div>
                <div class="introduce-2" @click="introduceDetailShow = !introduceDetailShow">查看详情</div>
            </div>
            <transition name="metro" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
                <div class="introduce-detail-text" :class="{ 'introduce-detail-text-active': introduceDetailShowDelay }" v-if="introduceDetailShow">
                    <div class="detail-text">
                        <p class="text">{{ libraryInfo.description || libraryInfo.briefDesc || '暂无描述' }}</p>
                    </div>
                    <div class="text-close" @click="introduceDetailShow = false">
                        <svg t="1671966797621" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1965" width="200" height="200">
                            <path
                                d="M576 512l277.333333 277.333333-64 64-277.333333-277.333333L234.666667 853.333333 170.666667 789.333333l277.333333-277.333333L170.666667 234.666667 234.666667 170.666667l277.333333 277.333333L789.333333 170.666667 853.333333 234.666667 576 512z"
                                fill="#ffffff"
                                p-id="1966"
                            ></path>
                        </svg>
                    </div>
                    <span class="dialog-style dialog-style1"></span>
                    <span class="dialog-style dialog-style2"></span>
                    <span class="dialog-style dialog-style3"></span>
                    <span class="dialog-style dialog-style4"></span>
                </div>
            </transition>
        </div>

        <div class="library-option">
            <div class="library-type" v-if="isSinger">
                <span :class="{ 'type-selected': artistPageType == 0 }" @click="changeType(0)">热门单曲</span>
                <span :class="{ 'type-selected': artistPageType == 1 }" @click="changeType(1)">专辑</span>
                <span :class="{ 'type-selected': artistPageType == 2 }" @click="changeType(2)">MV</span>
            </div>
            <div class="library-playall" v-show="isSongList || (isSinger && artistPageType == 0)">
                <div class="playall">
                    <svg t="1668421583939" class="playall-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6964" width="200" height="200" data-v-ef3af43f="">
                        <path
                            d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z"
                            p-id="6965"
                            data-v-ef3af43f=""
                        ></path>
                    </svg>
                    <span @click="playAllSafe()">播放全部</span>
                </div>
                <div class="playall-line"></div>
                <span @click="playAllSafe()" class="playall-en">PLAYALL</span>
            </div>
        </div>

        <div class="library-content-shell">
            <div class="library-content-panel">
                <template v-if="artistPageType == 0">
                    <div class="library-search-empty" v-if="showSongSearchEmpty">
                        <span class="empty-title">{{ songSearchEmptyTitle }}</span>
                        <span class="empty-subtitle" v-if="songSearchEmptyDescription">{{ songSearchEmptyDescription }}</span>
                    </div>
                    <LibrarySongList
                        v-else
                        :songlist="visibleLibrarySongs"
                        :queue-songlist="hasSongSearchKeyword ? librarySongs : null"
                        :source-indexes="visibleLibrarySourceIndexes"
                        class="library-content"
                    ></LibrarySongList>
                </template>
                <template v-else-if="artistPageType == 1">
                    <div class="library-search-empty" v-if="showSongSearchEmpty">
                        <span class="empty-title">{{ songSearchEmptyTitle }}</span>
                    </div>
                    <LibraryAlbumList v-else :albumlist="visibleArtistAlbums" class="library-content3"></LibraryAlbumList>
                </template>
                <template v-else-if="artistPageType == 2">
                    <div class="library-search-empty" v-if="showSongSearchEmpty">
                        <span class="empty-title">{{ songSearchEmptyTitle }}</span>
                    </div>
                    <LibraryMVList v-else :mvlist="visibleArtistMVs" class="library-content3"></LibraryMVList>
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.library-detail {
    --ld-text: #000000;
    --ld-muted: rgb(122, 122, 122);
    --ld-secondary: rgb(78, 78, 78);
    --ld-line: rgb(154, 154, 154);
    --ld-border: #000000;
    --ld-side-width: 130px;
    --ld-search-width: 130px;
    --ld-btn-bg: #000000;
    --ld-btn-text: #ffffff;
    --ld-btn-hover-bg: rgb(40, 40, 40);
    --ld-cover-border: rgb(218, 218, 218);
    --ld-overlay-bg: rgba(0, 0, 0, 0.66);
    --ld-overlay-border: rgba(255, 255, 255, 0.12);
    --ld-overlay-text: rgba(255, 255, 255, 0.92);
    --ld-overlay-corner: rgba(247, 247, 247, 0.9);

    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    .view-control {
        margin-left: -8px;
        height: 32px;
        svg {
            padding: 8px;
            width: 32px;
            height: 32px;
            float: left;
            transition: 0.2s;
            fill: currentColor;
            color: var(--text) !important;
            &:hover {
                cursor: pointer;
                opacity: 0.7;
            }
            &:active {
                transform: scale(0.9);
            }
        }
        .router-disabled {
            opacity: 0.45;
            color: var(--muted-text) !important;
            &:hover {
                opacity: 0.45;
            }
            &:active {
                transform: none;
            }
        }
        .router-last {
            margin-right: 20px;
        }
    }
    .library-introduce {
        width: 100%;
        display: flex;
        position: relative;
        justify-content: space-between;
        .introduce {
            width: calc(100% - var(--ld-side-width));
            display: flex;
            flex-direction: row;
            .introduce-img {
                margin-right: 10px;
                border: 0.5px solid var(--ld-cover-border);
                box-shadow: 0 0 6px 1px rgba(0, 0, 0, 0.03);
                // padding: 2Px;
                width: 150px;
                height: 150px;
                img {
                    width: 100%;
                    height: 100%;
                }
            }
            .introduce-img-circle {
                border-radius: 50%;
                img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                }
            }
            .introduce-info {
                width: calc(100% - 160px);
                display: flex;
                flex-direction: column;
                justify-content: space-around;
                align-items: flex-start;
                text-align: left;
                user-select: text;
                .introduce-name {
                    width: 90%;
                    font: 22px Source Han Sans;
                    font-weight: bold;
                    color: var(--ld-text);
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                    word-break: break-all;
                }
                .info-other {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    span {
                        font: 11px SourceHanSansCN-Bold;
                    }
                    .introduce-author {
                        width: 100%;
                        font-size: 12px;
                        color: var(--ld-text);
                        transition: 0.2s;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        -webkit-line-clamp: 1;
                        word-break: break-all;
                        &:hover {
                            cursor: pointer;
                            opacity: 0.7;
                        }
                    }
                    .introduce-num {
                        color: var(--ld-muted);
                    }
                    .library-operation {
                        margin-top: 10px;
                        display: flex;
                        flex-direction: row;
                        flex-wrap: nowrap;
                        align-items: center;
                        width: 100%;
                        min-height: 34px;
                        position: relative;
                        padding-right: calc(var(--ld-search-width) - var(--ld-side-width) + 14px);
                        .operation-item {
                            margin-right: 20px;
                            flex: 0 0 auto;
                            display: flex;
                            flex-direction: row;
                            align-items: center;
                            transition: 0.2s;
                            &:hover {
                                cursor: pointer;
                                opacity: 0.6;
                            }
                            svg {
                                width: 16px;
                                height: 16px;
                            }
                            span {
                                margin-left: 5px;
                                font-size: 15px;
                                color: var(--ld-text);
                            }
                        }
                        .operation-search {
                            position: absolute;
                            top: 50%;
                            right: calc(-1 * var(--ld-side-width));
                            transform: translateY(-50%);
                            display: flex;
                            align-items: center;
                            justify-content: flex-end;
                            width: var(--ld-search-width);
                            :deep(.song-filter-input) {
                                width: 100%;
                                max-width: 100%;
                            }
                            :deep(.song-filter-input .filter-input) {
                                text-align: center;
                            }
                        }
                    }
                }
            }
        }
        .introduce-other {
            width: var(--ld-side-width);
            div {
                width: 100%;
                height: 16px;
            }
            .introduce-1 {
                border: 1px solid var(--ld-border);
                font: 10px SourceHanSansCN-Bold;
                color: var(--ld-text);
            }
            .introduce-2 {
                margin-top: 6px;
                background-color: var(--ld-btn-bg);
                font: 10px SourceHanSansCN-Bold;
                color: var(--ld-btn-text);
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                    background-color: var(--ld-btn-hover-bg);
                }
            }
        }
        .introduce-detail-text {
            width: 0;
            height: 0;
            /* Frosted glass panel - Light mode wants deeper (darker) */
            background: var(--ld-overlay-bg);
            -webkit-backdrop-filter: blur(18px) saturate(120%);
            backdrop-filter: blur(18px) saturate(120%);
            border: 1px solid var(--ld-overlay-border);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
            position: fixed;
            z-index: 998;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            &-active {
                width: 700px;
                height: 400px;
                padding: 30px 60px;
            }
            .detail-text {
                width: 100%;
                height: 100%;
                overflow: auto;
                &::-webkit-scrollbar {
                    display: none;
                }
                .text {
                    margin: 0;
                    font: 14px Source Han Sans;
                    font-weight: 600;
                    color: var(--ld-overlay-text);
                    text-align: left;
                    text-indent: 2em;
                }
            }
            .text-close {
                width: 25px;
                height: 25px;
                position: absolute;
                top: 15px;
                right: 15px;
                opacity: 0;
                animation: text-close 0.1s 0.6s forwards;
                @keyframes text-close {
                    0% {
                        opacity: 0;
                    }
                    100% {
                        opacity: 1;
                    }
                }
                &:hover {
                    cursor: pointer;
                    opacity: 0.8 !important;
                }
                svg {
                    width: 100%;
                    height: 100%;
                }
                svg path {
                    fill: #ffffff !important;
                }
            }
            .dialog-style {
                width: 9px;
                height: 9px;
                background-color: var(--ld-overlay-corner);
                position: absolute;
                opacity: 0;
                animation: dialog-style-in 0.4s forwards;
                @keyframes dialog-style-in {
                    0% {
                        opacity: 0;
                    }
                    10% {
                        opacity: 1;
                    }
                    20% {
                        opacity: 0;
                    }
                    30% {
                        opacity: 1;
                    }
                    40% {
                        opacity: 0;
                    }
                    50% {
                        opacity: 1;
                    }
                    60% {
                        opacity: 0;
                    }
                    70% {
                        opacity: 1;
                    }
                    80% {
                        opacity: 0;
                    }
                    90% {
                        opacity: 0;
                    }
                    100% {
                        opacity: 1;
                    }
                }
            }
            $position: -4px;
            .dialog-style1 {
                top: $position;
                left: $position;
            }
            .dialog-style2 {
                top: $position;
                right: $position;
            }
            .dialog-style3 {
                bottom: $position;
                right: $position;
            }
            .dialog-style4 {
                bottom: $position;
                left: $position;
            }
        }
    }
    .library-option {
        margin-top: 15px;
        padding: 0 4px;
        .library-type {
            display: flex;
            flex-direction: row;
            span {
                margin-right: 25px;
                font: 15px SourceHanSansCN-Bold;
                color: var(--ld-secondary);
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                    color: var(--ld-text);
                }
            }
            .type-selected {
                color: var(--ld-text);
            }
        }
        .library-playall {
            margin: 10px 0;
            display: flex;
            flex-direction: row;
            align-items: center;
            .playall {
                display: flex;
                flex-direction: row;
                align-items: center;
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                    opacity: 0.6;
                }
                svg {
                    width: 17px;
                    height: 17px;
                }
                span {
                    margin: 0 5px;
                    font: 12px SourceHanSansCN-Bold;
                    color: var(--ld-text);
                    white-space: nowrap;
                }
            }
            .playall-line {
                width: 100%;
                height: 0.5px;
                background-color: var(--ld-line);
            }
            .playall-en {
                margin-left: 4px;
                font: 8px Geometos;
                color: var(--ld-line);
                transition: 0.2s;
                &:hover {
                    cursor: pointer;
                    color: var(--ld-text);
                }
            }
        }
    }
    .library-content-shell {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding-top: 12px;
    }
    .library-content-panel {
        flex: 1;
        min-height: 0;
    }
    .library-content,
    .library-content3 {
        height: 100%;
        overflow: hidden;
    }
    .library-search-empty {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 6px;
        text-align: center;
        .empty-title {
            font: 16px SourceHanSansCN-Bold;
            color: var(--ld-text);
        }
        .empty-subtitle {
            font: 11px SourceHanSansCN-Bold;
            color: var(--ld-muted);
            letter-spacing: 0.2px;
        }
    }
}
</style>

<style lang="scss">
html.dark .library-detail,
.dark .library-detail {
    --ld-text: var(--text);
    --ld-muted: var(--muted-text);
    --ld-secondary: rgba(241, 243, 245, 0.76);
    --ld-line: rgba(241, 243, 245, 0.36);
    --ld-border: rgba(241, 243, 245, 0.55);
    --ld-btn-bg: rgba(241, 243, 245, 0.94);
    --ld-btn-text: #0f1114;
    --ld-btn-hover-bg: #ffffff;
    --ld-cover-border: rgba(255, 255, 255, 0.24);
    --ld-overlay-bg: rgba(11, 14, 18, 0.84);
    --ld-overlay-border: rgba(255, 255, 255, 0.18);
    --ld-overlay-text: rgba(241, 243, 245, 0.92);
    --ld-overlay-corner: rgba(241, 243, 245, 0.72);
}

.metro-enter-active {
    animation: introduce-detail-in 0.6s 0.3s forwards;
}
.metro-leave-active {
    animation: introduce-detail-in 0.6s 0.1s reverse;
    .text-close {
        display: none;
    }
}
@keyframes introduce-detail-in {
    0% {
        width: 0;
        height: 0;
        padding: 0;
    }
    50% {
        width: 700px;
        height: 0;
        padding: 0 60px;
    }
    100% {
        width: 700px;
        height: 400px;
        padding: 30px 60px;
    }
}
</style>
