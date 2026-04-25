<script setup>
import { computed, ref } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { songTime } from '../utils/time'
import { addToList, addSong, setShuffledList, addToNext, startMusic, pauseMusic } from '../utils/player/lazy'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'
import { useLibraryStore } from '../store/libraryStore'
import { usePlayerStore } from '../store/playerStore'
import { useOtherStore } from '../store/otherStore'
import { storeToRefs } from 'pinia'
import { noticeOpen } from '../utils/dialog'
import { getSongDisplayName } from '../utils/songName'

const router = useRouter()
const userStore = useUserStore()
const libraryStore = useLibraryStore()
const { libraryInfo } = storeToRefs(libraryStore)
const playerStore = usePlayerStore()
const { songId, playMode, playing, showSongTranslation } = storeToRefs(playerStore)
const otherStore = useOtherStore()
const props = defineProps({
    songlist: {
        type: Array,
        default: () => [],
    },
    type: {
        type: String,
        default: '',
    },
    queueSonglist: {
        type: Array,
        default: null,
    },
    sourceIndexes: {
        type: Array,
        default: null,
    },
    queueListType: {
        type: String,
        default: '',
    },
    queueMeta: {
        type: Object,
        default: null,
    },
    artistRouteEnabled: {
        type: Boolean,
        default: true,
    },
    contextMenuMode: {
        type: String,
        default: '',
    },
})
const hoverRowKey = ref(null)
const rowKeyBySong = new WeakMap()
let rowKeySeed = 0

const resolveRowKey = (song, songIndex) => {
    if (song && typeof song == 'object') {
        let cached = rowKeyBySong.get(song)
        if (!cached) {
            rowKeySeed += 1
            const stableId = String(song.id ?? 'unknown')
            cached = `library-song-${stableId}-${rowKeySeed}`
            rowKeyBySong.set(song, cached)
        }
        return cached
    }
    return `library-song-fallback-${String(song?.id ?? 'unknown')}-${songIndex}`
}

const scrollerItems = computed(() => {
    const songs = Array.isArray(props.songlist) ? props.songlist : []
    const sourceIndexes = Array.isArray(props.sourceIndexes) ? props.sourceIndexes : []
    return songs.map((song, songIndex) => ({
        rowKey: resolveRowKey(song, songIndex),
        songIndex,
        sourceIndex: Number.isInteger(sourceIndexes[songIndex]) ? sourceIndexes[songIndex] : songIndex,
        song,
    }))
})
const queueSongs = computed(() => (Array.isArray(props.queueSonglist) ? props.queueSonglist : props.songlist))

const checkArtist = artistId => {
    if (!props.artistRouteEnabled || !artistId) return
    router.push('/mymusic/artist/' + artistId)
    playerStore.forbidLastRouter = true
}
const play = async (song, index) => {
    if (!song.playable) {
        noticeOpen(`当前歌曲无法播放${!!song.reason ? ', ' + song.reason : ''}`, 2)
        return
    }
    if (props.type == 'search') {
        // 搜索结果播放时：沿用“新增到现有播放列表并立即播放”的统一逻辑
        await addToNext(song, true)
        return
    }
    await addToList(props.queueListType || router.currentRoute.value.name, queueSongs.value || [], props.queueMeta || null)
    await addSong(song.id, index, true)
    if (playMode.value == 3) await setShuffledList()
}

const togglePlay = async (song, index) => {
    if (songId.value === song.id) {
        if (playing.value) {
            await pauseMusic()
        } else {
            await startMusic()
        }
        return
    }
    await play(song, index)
}

const openMenu = (e, item) => {
    otherStore.contextMenuShow = true
    otherStore.selectedItem = item
    otherStore.selectedPlaylist = libraryInfo.value

    if (props.contextMenuMode === 'siren' || item?.source === 'siren') {
        otherStore.selectedPlaylist = null
        otherStore.menuTree = otherStore.tree5
    } else if (otherStore.selectedPlaylist && otherStore.selectedPlaylist.creator && otherStore.selectedPlaylist.creator.userId == userStore.user.userId) {
        otherStore.menuTree = otherStore.tree1
    } else {
        otherStore.menuTree = otherStore.tree2
    }

    const { clientX, clientY } = e
    const menuList = document.getElementById('menu')
    const screenWidth = document.body.clientWidth
    const screenHeight = document.body.clientHeight
    if (screenWidth - clientX < 120) {
        menuList.style.left = screenWidth - 120 + 'Px'
        menuList.style.right = null
    } else {
        menuList.style.right = null
        menuList.style.left = clientX + 'Px'
    }
    if (screenHeight - clientY < 280) {
        menuList.style.top = screenHeight - 280 + 'Px'
        menuList.style.bottom = null
    } else {
        menuList.style.bottom = null
        menuList.style.top = clientY + 'Px'
    }
}
</script>

<template>
    <div class="library-content">
        <RecycleScroller v-if="props.songlist" id="libraryScroll" class="library-song-list" :items="scrollerItems" :item-size="42" key-field="rowKey" v-slot="{ item }">
            <div
                class="list-item"
                :class="{ 'list-item-playing': songId == item.song.id, 'list-item-disabled': item.song.playable !== undefined && !item.song.playable, 'list-item-vip': item.song.vipOnly }"
                @mouseenter="hoverRowKey = item.rowKey"
                @mouseleave="hoverRowKey = null"
                @dblclick="play(item.song, item.sourceIndex)"
                @contextmenu="openMenu($event, item.song)"
            >
                <div class="item-title">
                    <div class="item-state">
                        <button
                            class="item-play-btn"
                            :class="{ 'state-visible': hoverRowKey === item.rowKey }"
                            @click.stop="togglePlay(item.song, item.sourceIndex)"
                            :aria-label="songId === item.song.id && playing ? '暂停' : '播放'"
                            :tabindex="hoverRowKey === item.rowKey ? 0 : -1"
                        >
                            <svg v-if="songId === item.song.id && playing" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                <rect x="256" y="200" width="160" height="624" rx="32" fill="currentColor" />
                                <rect x="608" y="200" width="160" height="624" rx="32" fill="currentColor" />
                            </svg>
                            <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z"
                                    fill="currentColor"
                                ></path>
                            </svg>
                        </button>
                        <div class="playing-eq" :class="{ 'is-paused': !playing, 'state-visible': hoverRowKey !== item.rowKey && songId == item.song.id }" aria-hidden="true">
                            <span class="bar"></span>
                            <span class="bar"></span>
                            <span class="bar"></span>
                            <span class="bar"></span>
                        </div>
                        <div class="item-num" :class="{ 'state-visible': hoverRowKey !== item.rowKey && songId != item.song.id }">{{ item.sourceIndex + 1 }}</div>
                    </div>
                    <span class="item-name">
                        <span class="item-name-text">{{ getSongDisplayName(item.song, '', showSongTranslation) }}</span>
                        <span v-if="item.song.vipOnly" class="item-vip-tag">VIP</span>
                    </span>
                </div>
                <div class="item-other">
                    <div class="item-author" v-if="item.song.ar">
                        <span class="item-singer" @click="checkArtist(singer.id)" v-for="(singer, index) in item.song.ar">{{ singer.name }}{{ index == item.song.ar.length - 1 ? '' : '/' }}</span>
                    </div>
                        <span class="item-time">{{ songTime(item.song.dt || item.song.duration) || '--:--' }}</span>
                </div>
            </div>
        </RecycleScroller>
    </div>
</template>

<style scoped lang="scss">
.library-content {
    width: 100%;
    .library-song-list {
        height: 100%;
        overflow: auto;
        overflow-anchor: none;
        &::-webkit-scrollbar {
            width: 5px;
            height: 10px;
            background-color: rgba(0, 0, 0, 0);
        }
        &::-webkit-scrollbar-thumb {
            background-color: rgba(0, 0, 0, 0);
        }
        &::-webkit-scrollbar-track {
            display: none;
        }
        &:hover::-webkit-scrollbar-thumb {
            background-color: rgba(0, 0, 0, 0.04);
        }
        .list-item {
            height: 42px;
            padding: 12px 8px;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            transition: 0.2s;
            user-select: text;
            &:hover {
                cursor: default;
                background-color: rgba(0, 0, 0, 0.045);
            }
            .item-title {
                width: 50%;
                display: flex;
                flex-direction: row;
                align-items: center;
                svg {
                    width: 14px;
                    height: 14px;
                }
                .playing-eq {
                    width: 14px;
                    height: 14px;
                }
                .item-state {
                    width: 26px;
                    height: 22px;
                    position: relative;
                    flex: 0 0 26px;
                    .item-play-btn,
                    .playing-eq,
                    .item-num {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        opacity: 0;
                        visibility: hidden;
                        transition: opacity 0.12s ease;
                    }
                    .state-visible {
                        opacity: 1;
                        visibility: visible;
                    }
                    .item-play-btn {
                        width: 22px;
                        height: 22px;
                        border: none;
                        outline: none;
                        box-shadow: none;
                        background: transparent !important;
                        -webkit-appearance: none;
                        appearance: none;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0;
                        color: inherit;
                        cursor: pointer;
                        pointer-events: none;
                        transition:
                            opacity 0.12s ease,
                            transform 0.15s ease;
                        svg {
                            width: 18px;
                            height: 18px;
                        }
                        &.state-visible {
                            pointer-events: auto;
                        }
                        &:hover {
                            opacity: 0.7;
                        }
                        &:active {
                            transform: translate(-50%, -50%) scale(0.9);
                        }
                    }
                    .item-num {
                        font: 14px Geometos;
                        color: rgb(127, 127, 127);
                    }
                }
                .item-name {
                    width: calc(100% - 26px - 14px);
                    margin-left: 14px;
                    font: 14px SourceHanSansCN-Bold;
                    font-weight: bold;
                    color: black;
                    overflow: hidden;
                    text-align: left;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 1;
                    word-break: break-all;
                    .item-name-text {
                        position: relative;
                    }
                    .item-vip-tag {
                        flex: 0 0 auto;
                        padding: 0 2px;
                        border: 0.5px solid currentColor;
                        font: 8px Bender-Bold;
                        font-weight: 100;
                        line-height: 1.2;
                    }
                }
            }
            .item-other {
                margin-left: 14px;
                width: 45%;
                display: flex;
                flex-direction: row;
                justify-content: space-between;
                span {
                    font: 14px SourceHanSansCN-Bold;
                    font-weight: bold;
                    color: black;
                }
                .item-author {
                    width: 70%;
                    text-align: left;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 1;
                    word-break: break-all;
                    .item-singer {
                        transition: 0.1s;
                        &:hover {
                            cursor: pointer;
                            opacity: 0.6;
                        }
                    }
                }
                .item-time {
                    width: 30%;
                }
            }
        }
        .list-item:last-child {
            margin-bottom: 10px;
        }
        .list-item-playing {
            background-color: rgba(0, 0, 0, 0.045);
        }
        .list-item-disabled {
            opacity: 0.7;
            .item-title .item-name,
            .item-other span {
                color: rgba(156, 156, 156, 0.7);
            }
        }
        .list-item-vip {
            .item-title .item-name {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
                .item-name-text {
                    display: block;
                    flex: 0 1 auto;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    word-break: normal;
                }
                .item-vip-tag {
                    flex: 0 0 auto;
                }
            }
        }
    }
}
</style>
