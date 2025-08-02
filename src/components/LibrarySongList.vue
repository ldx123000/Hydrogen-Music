<script setup>
import { computed } from 'vue';
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { songTime } from '../utils/player';
import { nanoid } from 'nanoid';
import { addToList, addSong, setShuffledList, addToNext } from '../utils/player';
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
const { songId, playMode } = storeToRefs(playerStore);
const otherStore = useOtherStore();
const props = defineProps(['songlist', 'type']);

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
                @dblclick="play(item, index)"
                @contextmenu="openMenu($event, item)"
            >
                <div class="item-title">
                    <div class="item-state">
                        <svg v-show="songId == item.id" t="1669115475194" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="10562" width="200" height="200">
                            <path
                                d="M158.249961 614.402466c37.219322 0 67.372153 30.559802 67.372153 68.272422v273.065023c0 37.700288-30.152831 68.260089-67.372153 68.260089S90.865475 993.440198 90.865475 955.739911V682.674888a68.753387 68.753387 0 0 1 19.731914-48.269194 66.977515 66.977515 0 0 1 47.652572-20.003228zM394.083329 0.04933c37.20699 0 67.372153 30.572134 67.372153 68.272422v887.418159c0 37.700288-30.165163 68.260089-67.372153 68.260089s-67.322823-30.559802-67.322824-68.260089V68.272422c0-37.700288 30.103501-68.223092 67.322824-68.223092zM629.916696 273.077355c37.20699 0 67.384486 30.559802 67.384486 68.260089v614.402467c0 37.700288-30.177496 68.260089-67.384486 68.260089s-67.384486-30.559802-67.384486-68.260089v-614.402467c0-37.700288 30.165163-68.260089 67.384486-68.260089z m235.833368-136.544844a66.878855 66.878855 0 0 1 47.640239 20.003228 68.704057 68.704057 0 0 1 19.731914 48.269194v750.934978c0 37.700288-30.177496 68.260089-67.384486 68.260089s-67.384486-30.559802-67.384486-68.260089V204.767936a68.753387 68.753387 0 0 1 19.731914-48.269195 66.928185 66.928185 0 0 1 47.652572-20.003227z m0 0"
                                p-id="10563"
                            ></path>
                        </svg>
                        <div class="item-num" v-show="!(songId == item.id)">{{ index + 1 }}</div>
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
                .item-state {
                    width: 26px;
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
