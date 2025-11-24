<script setup>
import { computed, ref } from 'vue';
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { songTime } from '../utils/player';
import { nanoid } from 'nanoid';
import { addToList, addSong, setShuffledList, addToNext, startMusic, pauseMusic } from '../utils/player';
import { useRouter } from 'vue-router';
import { useUserStore } from '../store/userStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useOtherStore } from '../store/otherStore';
import { storeToRefs } from 'pinia';
import { noticeOpen } from '../utils/dialog';

const router = useRouter();
const userStore = useUserStore();
const libraryStore = useLibraryStore();
const { libraryInfo } = storeToRefs(libraryStore);
const playerStore = usePlayerStore();
const { songId, playMode, playing } = storeToRefs(playerStore);
const otherStore = useOtherStore();
const props = defineProps(['songlist', 'type']);
const hoverNid = ref(null);

const getData = computed(() => {
    props.songlist.map(item => {
        if (!item.nid) Object.assign(item, { nid: nanoid() });
    });
    return props.songlist;
});

const checkArtist = artistId => {
    router.push('/mymusic/artist/' + artistId);
    playerStore.forbidLastRouter = true;
};
const play = (song, index) => {
    if (!song.playable) {
        noticeOpen(`当前歌曲无法播放${!!song.reason ? ', ' + song.reason : ''}`, 2);
        return;
    }
    if (props.type == 'search') {
        // 修复：从搜索结果点击时，应立即播放，而不是添加到下一首
        // 创建一个仅包含当前点击歌曲的临时列表
        const searchSongList = [song];

        // 更新播放列表
        addToList('search', searchSongList);

        // 立即播放
        addSong(song.id, 0, true);

        // 如果当前是随机播放模式，重新生成随机列表
        if (playMode.value == 3) {
            setShuffledList();
        }

        return;
    }
    addToList(router.currentRoute.value.name, props.songlist);
    addSong(song.id, index, true);
    if (playMode.value == 3) setShuffledList();
};

const togglePlay = (song, index) => {
    if (songId.value === song.id) {
        if (playing.value) {
            pauseMusic();
        } else {
            startMusic();
        }
        return;
    }
    play(song, index);
};

const openMenu = (e, item) => {
    otherStore.contextMenuShow = true;
    otherStore.selectedItem = item;
    otherStore.selectedPlaylist = libraryInfo.value;

    if (otherStore.selectedPlaylist && otherStore.selectedPlaylist.creator && otherStore.selectedPlaylist.creator.userId == userStore.user.userId) otherStore.menuTree = otherStore.tree1;
    else otherStore.menuTree = otherStore.tree2;

    const { clientX, clientY } = e;
    const menuList = document.getElementById('menu');
    const screenWidth = document.body.clientWidth;
    const screenHeight = document.body.clientHeight;
    if (screenWidth - clientX < 120) {
        menuList.style.left = screenWidth - 120 + 'Px';
        menuList.style.right = null;
    } else {
        menuList.style.right = null;
        menuList.style.left = clientX + 'Px';
    }
    if (screenHeight - clientY < 240) {
        menuList.style.top = screenHeight - 240 + 'Px';
        menuList.style.bottom = null;
    } else {
        menuList.style.bottom = null;
        menuList.style.top = clientY + 'Px';
    }
};
</script>

<template>
    <div class="library-content">
        <RecycleScroller v-if="props.songlist" id="libraryScroll" class="library-song-list" :items="getData" :item-size="44" key-field="nid" v-slot="{ item, index }">
            <div
                class="list-item"
                :class="{ 'list-item-playing': songId == item.id, 'list-item-disabled': item.playable !== undefined && !item.playable, 'list-item-vip': item.vipOnly }"
                @mouseenter="hoverNid = item.nid"
                @mouseleave="hoverNid = null"
                @dblclick="play(item, index)"
                @contextmenu="openMenu($event, item)"
            >
                <div class="item-title">
                    <div class="item-state">
                        <button v-if="hoverNid === item.nid" class="item-play-btn" @click.stop="togglePlay(item, index)" :aria-label="(songId === item.id && playing) ? '暂停' : '播放'">
                            <svg v-if="songId === item.id && playing" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                <rect x="256" y="200" width="160" height="624" rx="32" fill="currentColor" />
                                <rect x="608" y="200" width="160" height="624" rx="32" fill="currentColor" />
                            </svg>
                            <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                <path d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z" fill="currentColor"></path>
                            </svg>
                        </button>
                        <template v-else>
                            <div class="playing-eq" v-show="songId == item.id" :class="{ 'is-paused': !playing }" aria-hidden="true">
                                <span class="bar"></span>
                                <span class="bar"></span>
                                <span class="bar"></span>
                                <span class="bar"></span>
                            </div>
                            <div class="item-num" v-show="!(songId == item.id)">{{ index + 1 }}</div>
                        </template>
                    </div>
                    <span class="item-name">
                        <span>{{ item.name }}</span>
                    </span>
                </div>
                <div class="item-other">
                    <div class="item-author" v-if="item.ar">
                        <span class="item-singer" @click="checkArtist(singer.id)" v-for="(singer, index) in item.ar">{{ singer.name }}{{ index == item.ar.length - 1 ? '' : '/' }}</span>
                    </div>
                    <span class="item-time">{{ songTime(item.dt || item.duration) }}</span>
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
            height: 42Px;
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
                        transition: opacity 0.15s ease, transform 0.15s ease;
                        svg {
                            width: 18px;
                            height: 18px;
                        }
                        &:hover {
                            opacity: 0.7;
                        }
                        &:active {
                            transform: scale(0.9);
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
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 1;
                    word-break: break-all;
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
            .item-title .item-name span {
                position: relative;
                &::after {
                    content: 'VIP';
                    width: max-content;
                    padding: 0 2px;
                    border: 0.5px solid rgb(156, 156, 156);
                    font: 8px Bender-Bold;
                    font-weight: 100;
                    position: absolute;
                    display: block;
                    top: 50%;
                    transform: translate(50%, -50%);
                    right: -20px;
                }
            }
        }
    }
}
</style>
