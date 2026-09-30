<script setup>
import { computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { playAll } from '../utils/player/lazy'
import { useSirenStore } from '../store/sirenStore'
import LibrarySongList from '../components/LibrarySongList.vue'

const route = useRoute()
const router = useRouter()
const sirenStore = useSirenStore()
const { albums, albumsLoading, albumsError, albumDetailsById, albumLoadingById, albumErrorById, keyword } = storeToRefs(sirenStore)

const currentAlbumId = computed(() => String(route.params.id || '').trim())
const isAlbumRoute = computed(() => currentAlbumId.value !== '')
const currentAlbum = computed(() => {
    if (!currentAlbumId.value) return null
    return albumDetailsById.value[currentAlbumId.value] || null
})
const currentAlbumLoading = computed(() => !!albumLoadingById.value[currentAlbumId.value])
const currentAlbumError = computed(() => albumErrorById.value[currentAlbumId.value] || '')

const normalizedKeyword = computed(() => String(keyword.value || '').trim().toLocaleLowerCase())
const visibleAlbums = computed(() => {
    const targetAlbums = Array.isArray(albums.value) ? albums.value : []
    if (!normalizedKeyword.value) return targetAlbums

    return targetAlbums.filter(album => {
        const haystack = [
            album?.name,
            album?.artistNames,
            ...(Array.isArray(album?.artistes) ? album.artistes : []),
        ].join('\n').toLocaleLowerCase()
        return haystack.includes(normalizedKeyword.value)
    })
})
const visibleSongs = computed(() => {
    const songs = Array.isArray(currentAlbum.value?.songs) ? currentAlbum.value.songs : []
    if (!normalizedKeyword.value) return songs

    return songs.filter(song => {
        const haystack = [
            song?.name,
            ...(Array.isArray(song?.ar) ? song.ar.map(artist => artist?.name) : []),
        ].join('\n').toLocaleLowerCase()
        return haystack.includes(normalizedKeyword.value)
    })
})

const loadPageData = async (force = false) => {
    await sirenStore.ensureAlbums(force)
    if (isAlbumRoute.value) {
        await sirenStore.ensureAlbumDetail(currentAlbumId.value, force)
    }
}

let savedScrollTop = 0
let shouldRestoreScroll = false

const getScrollContainer = () => document.querySelector('.home-content')

const openAlbum = albumId => {
    const normalizedAlbumId = String(albumId || '').trim()
    if (!normalizedAlbumId) return
    const container = getScrollContainer()
    if (container) savedScrollTop = container.scrollTop
    shouldRestoreScroll = true
    router.push(`/siren/album/${normalizedAlbumId}`)
}

const backToAlbums = () => {
    router.push('/siren')
}

const reloadPage = () => {
    loadPageData(true)
}

const playAllSongs = () => {
    if (!visibleSongs.value.length) return
    playAll('siren', visibleSongs.value, { id: currentAlbumId.value || 'siren' })
}

watch(
    () => route.fullPath,
    (newPath, oldPath) => {
        sirenStore.setKeyword('')
        loadPageData(false)

        // 仅从专辑详情点击返回时恢复滚动位置
        if (!isAlbumRoute.value && shouldRestoreScroll) {
            shouldRestoreScroll = false
            nextTick(() => {
                const container = getScrollContainer()
                if (container) container.scrollTop = savedScrollTop
            })
        } else if (!isAlbumRoute.value) {
            nextTick(() => {
                const container = getScrollContainer()
                if (container) container.scrollTop = 0
            })
        }
    },
    { immediate: true }
)
</script>

<template>
    <div class="siren-page">
        <div class="page-header">
            <div class="page-title-group">
                <button v-if="isAlbumRoute" class="header-back" type="button" @click="backToAlbums">返回</button>
                <div v-if="!isAlbumRoute" class="page-title-block">
                    <h1 class="page-title">{{ isAlbumRoute ? (currentAlbum?.name || '塞壬唱片') : '塞壬唱片' }}</h1>
                    <p class="page-subtitle">
                        {{ isAlbumRoute ? (currentAlbum?.artistNames || '官方音源专区') : 'Monster Siren 官方音源专区' }}
                    </p>
                </div>
            </div>
            <div v-if="!isAlbumRoute" class="page-actions">
                <input
                    v-model="keyword"
                    class="page-search"
                    placeholder="搜索专辑"
                    type="text"
                />
                <button class="action-button" type="button" @click="reloadPage">刷新</button>
            </div>
        </div>

        <div v-if="!isAlbumRoute" class="page-body">
            <div v-if="albumsLoading" class="state-block">专辑列表加载中...</div>
            <div v-else-if="albumsError" class="state-block state-error">
                <span>{{ albumsError }}</span>
                <button class="inline-button" type="button" @click="reloadPage">重试</button>
            </div>
            <div v-else-if="visibleAlbums.length === 0" class="state-block">没有匹配的专辑</div>
            <div v-else class="album-grid">
                <button
                    v-for="album in visibleAlbums"
                    :key="album.id"
                    class="album-card"
                    type="button"
                    @click="openAlbum(album.id)"
                >
                    <div class="album-cover">
                        <img v-lazy :src="album.coverUrl" :alt="album.name" />
                    </div>
                    <div class="album-meta">
                        <span class="album-name">{{ album.name }}</span>
                        <span class="album-artist">{{ album.artistNames || '塞壬唱片' }}</span>
                    </div>
                </button>
            </div>
        </div>

        <div v-else class="page-body">
            <div v-if="currentAlbumLoading && !currentAlbum" class="state-block">专辑详情加载中...</div>
            <div v-else-if="currentAlbumError && !currentAlbum" class="state-block state-error">
                <span>{{ currentAlbumError }}</span>
                <button class="inline-button" type="button" @click="reloadPage">重试</button>
            </div>
            <template v-else-if="currentAlbum">
                <div class="album-detail">
                    <div class="album-detail-cover">
                        <img v-lazy :src="currentAlbum.coverUrl" :alt="currentAlbum.name" />
                    </div>
                    <div class="album-detail-info">
                        <span class="detail-kicker">MONSTER SIREN</span>
                        <h2 class="detail-title">{{ currentAlbum.name }}</h2>
                        <div class="detail-meta">
                            <span>{{ currentAlbum.artistNames || '塞壬唱片' }}</span>
                            <span v-if="currentAlbum.belong">{{ currentAlbum.belong }}</span>
                            <span>{{ currentAlbum.songs.length }} 首</span>
                        </div>
                        <p v-if="currentAlbum.intro" class="detail-intro">{{ currentAlbum.intro }}</p>
                    </div>
                </div>

                <div class="siren-playall" v-if="visibleSongs.length">
                    <div class="playall" @click="playAllSongs">
                        <svg t="1668421583939" class="playall-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6964" width="200" height="200">
                            <path
                                d="M864.5 516.2c-2.4-4.1-6.2-6.9-10.4-8.3L286.4 159c-8.9-5-20.3-2-25.5 6.6-2.1 3.6-2.8 7.5-2.3 11.3v697.5c-0.5 3.8 0.2 7.8 2.3 11.3 5.2 8.7 16.6 11.6 25.5 6.6l567.7-349c4.2-1.3 8-4.2 10.4-8.3 1.7-3 2.5-6.3 2.4-9.5 0.1-3-0.7-6.3-2.4-9.3z m-569-308.8l517.6 318.3L295.5 844V207.4z"
                                p-id="6965"
                            ></path>
                        </svg>
                        <span>播放全部</span>
                    </div>
                    <div class="playall-line"></div>
                    <span @click="playAllSongs" class="playall-en">PLAYALL</span>
                </div>

                <div v-if="visibleSongs.length === 0" class="state-block">没有匹配的曲目</div>
                <LibrarySongList
                    v-else
                    :songlist="visibleSongs"
                    :queue-songlist="visibleSongs"
                    :queue-list-type="'siren'"
                    :queue-meta="{ id: currentAlbumId }"
                    :artist-route-enabled="false"
                    :context-menu-mode="'siren'"
                ></LibrarySongList>
            </template>
        </div>
    </div>
</template>

<style scoped lang="scss">
.siren-page {
    width: 100%;
    min-height: 100%;
    padding-bottom: 110px;
    display: flex;
    flex-direction: column;
    text-align: left;
}

.page-header {
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
}

.page-title-group {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

.header-back,
.action-button,
.inline-button {
    border-radius: 0;
    background-color: rgba(255, 255, 255, 0.35);
    color: black;
    font: 13px SourceHanSansCN-Bold;
    outline: none;
    transition: 0.2s;
}

.header-back,
.action-button {
    padding: 10px 14px;
}

.inline-button {
    padding: 6px 10px;
}

.header-back:hover,
.action-button:hover,
.inline-button:hover {
    cursor: pointer;
    opacity: 0.8;
}

.header-back:active,
.action-button:active,
.inline-button:active {
    transform: scale(0.95);
}

.action-button.primary {
    background-color: rgb(20, 20, 20);
    color: white;
}

.page-title {
    margin: 0;
    font: 30px Gilroy-ExtraBold;
    color: black;
    letter-spacing: 0.02em;
}

.page-subtitle {
    margin: 6px 0 0 0;
    font: 14px SourceHanSansCN-Bold;
    color: rgba(0, 0, 0, 0.68);
}

.page-actions {
    display: flex;
    gap: 12px;
    align-items: center;
}

.page-search {
    width: 220px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 0;
    background-color: rgba(255, 255, 255, 0.35);
    color: black;
    font: 14px SourceHanSansCN-Bold;
    outline: none;
    transition: 0.2s;
    &:focus {
        border-color: black;
    }
}

.page-body {
    width: 100%;
}

.state-block {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
    align-items: center;
    font: 15px SourceHanSansCN-Bold;
    color: rgba(0, 0, 0, 0.5);
}

.state-error {
    color: rgb(137, 31, 31);
}

.album-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
    gap: 18px;
}

.album-card {
    position: relative;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 0;
    outline: none;
    background-color: rgba(255, 255, 255, 0.35);
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
    transform: perspective(900px);
    transform-origin: center;
    transition: transform 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease, background-color 0.28s ease;
    &::before,
    &::after {
        content: "";
        position: absolute;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.28s ease;
    }
    &::before {
        inset: 6px;
        border: 1px solid rgba(0, 0, 0, 0.08);
    }
    &::after {
        left: 12px;
        right: 12px;
        bottom: -7px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.34), transparent);
    }
    &:hover {
        cursor: pointer;
        border-color: rgba(0, 0, 0, 0.2);
        background-color: rgba(255, 255, 255, 0.52);
        box-shadow: 0 18px 34px rgba(0, 0, 0, 0.14);
        transform: perspective(900px) rotateX(4deg) translateY(-4px);
    }
    &:hover::before,
    &:hover::after {
        opacity: 1;
    }
    &:active {
        transform: perspective(900px) translateY(-1px) scale(0.98);
    }
}

:global(html.dark .album-card::after) {
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent) !important;
}

.album-cover {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background-color: rgba(0, 0, 0, 0.045);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0);
    transition: box-shadow 0.28s ease;
}

.album-cover::after {
    content: "";
    position: absolute;
    top: -58%;
    left: -24%;
    width: 150%;
    height: 150%;
    background: linear-gradient(rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.18) 48%, rgba(255, 255, 255, 0) 52%);
    opacity: 0.36;
    transform: rotate(24deg) translateY(-18%);
    transition: transform 0.38s ease, opacity 0.38s ease;
    pointer-events: none;
}

.album-card:hover .album-cover {
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
}

.album-card:hover .album-cover::after {
    opacity: 0.92;
    transform: rotate(24deg) translateY(14%);
}

.album-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.album-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.album-name {
    font: 15px SourceHanSansCN-Bold;
    color: black;
    line-height: 1.35;
}

.album-artist {
    font: 12px SourceHanSansCN-Bold;
    color: rgba(0, 0, 0, 0.58);
}

.album-detail {
    margin-bottom: 24px;
    display: flex;
    gap: 24px;
    align-items: flex-start;
}

.album-detail-cover {
    width: 220px;
    flex: 0 0 220px;
    background-color: rgba(255, 255, 255, 0.35);
}

.album-detail-cover img {
    width: 100%;
    display: block;
}

.album-detail-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.detail-kicker {
    font: 12px Geometos;
    color: rgba(0, 0, 0, 0.56);
    letter-spacing: 0.12em;
}

.detail-title {
    margin: 0;
    font: 28px SourceHanSansCN-Heavy;
    color: black;
    line-height: 1.2;
}

.detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font: 13px SourceHanSansCN-Bold;
    color: rgba(0, 0, 0, 0.6);
}

.detail-intro {
    margin: 4px 0 0 0;
    max-width: 720px;
    font: 14px SourceHanSansCN-Bold;
    color: rgba(0, 0, 0, 0.72);
    line-height: 1.7;
    white-space: pre-wrap;
}

.siren-playall {
    margin: 10px 0 22px;
    padding: 0 4px;
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
            color: black;
            white-space: nowrap;
        }
    }

    .playall-line {
        width: 100%;
        height: 0.5px;
        background-color: rgba(0, 0, 0, 0.2);
    }

    .playall-en {
        margin-left: 4px;
        font: 8px Geometos;
        color: rgba(0, 0, 0, 0.2);
        transition: 0.2s;

        &:hover {
            cursor: pointer;
            color: black;
        }
    }
}

@media screen and (max-width: 900px) {
    .page-header,
    .album-detail {
        flex-direction: column;
    }

    .page-actions {
        width: 100%;
        flex-wrap: wrap;
    }

    .page-search {
        width: 100%;
    }

    .album-detail-cover {
        width: min(100%, 320px);
        flex-basis: auto;
    }
}
</style>
