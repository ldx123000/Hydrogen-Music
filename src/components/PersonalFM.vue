<template>
    <div class="personal-fm">
        <div class="fm-header">
            <h1>私人漫游</h1>
            <span class="fm-subtitle">根据你的音乐喜好为你推荐</span>
        </div>

        <div class="fm-content" v-if="currentSong && !loading">
            <div class="fm-main">
                <div class="fm-cover" @click="togglePlay">
                    <img :src="currentSong.album?.picUrl || '/src/assets/default-cover.png'" :alt="currentSong.name" />
                    <div class="fm-play-overlay">
                        <svg v-if="!isPlaying" width="40" height="40" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        <svg v-else width="40" height="40" viewBox="0 0 24 24" fill="white">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    </div>
                </div>

                <div class="fm-info">
                    <h2 class="song-name">{{ currentSong.name }}</h2>
                    <p class="artist-name">{{ currentSong.artists?.map(a => a.name).join(' / ') }}</p>
                    <p class="album-name">{{ currentSong.album?.name }}</p>
                </div>
            </div>

            <div class="fm-actions">
                <div class="action-btn prev" @click="prevSong" title="上一首">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                </div>

                <div class="action-btn trash" @click="trashSong" title="不喜欢">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                </div>

                <div class="action-btn like" @click="likeSong" :class="{ active: currentSong.liked }" title="喜欢">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                        />
                    </svg>
                </div>

                <div class="action-btn next" @click="nextSong" title="下一首">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                </div>
            </div>
        </div>

        <div class="fm-loading" v-else-if="loading">
            <div class="loading-spinner"></div>
            <p>正在为你准备音乐...</p>
        </div>

        <div class="fm-empty" v-else>
            <div class="empty-icon">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
            </div>
            <p>无法加载漫游歌曲</p>
            <p class="error-hint">请检查网络连接或稍后重试</p>
            <div class="refresh-button" @click="refreshFM">重试</div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getPersonalFM, fmTrash, likeMusic } from '../api/song';
import { getRecommendSongs } from '../api/playlist';
import { usePlayerStore } from '../store/playerStore';
import { useUserStore } from '../store/userStore';
import { mapSongsPlayableStatus } from '../utils/songStatus';
import { getMusicUrl, getLyric } from '../api/song';
import { play } from '../utils/player';
import { storeToRefs } from 'pinia';

const playerStore = usePlayerStore();
const userStore = useUserStore();
const { songId, playing } = storeToRefs(playerStore);

const fmSongs = ref([]);
const playedSongs = ref([]); // 已播放的歌曲历史
const currentIndex = ref(0);
const loading = ref(false);

const currentSong = computed(() => {
    // 先从已播放历史中查找
    if (currentIndex.value < playedSongs.value.length) {
        return playedSongs.value[currentIndex.value] || null;
    }
    return null;
});

const isPlaying = computed(() => {
    return playing.value && songId.value === currentSong.value?.id;
});

const togglePlay = async () => {
    console.log('togglePlay clicked!');
    console.log('currentSong:', currentSong.value);

    if (!currentSong.value) {
        console.log('No current song available');
        return;
    }

    // 如果当前歌曲已经在播放，只需要切换播放状态
    if (songId.value === currentSong.value.id && playerStore.currentMusic) {
        if (playing.value) {
            console.log('Pausing current FM song');
            playerStore.currentMusic.pause();
        } else {
            console.log('Resuming current FM song');
            playerStore.currentMusic.play();
        }
        return;
    }

    // 播放新的FM歌曲
    console.log('Playing new FM song:', currentSong.value.name);

    try {
        // 获取歌曲URL
        console.log('Getting music URL for:', currentSong.value.id);
        const urlResponse = await getMusicUrl(currentSong.value.id, 'standard');
        console.log('Music URL response:', urlResponse);

        if (urlResponse && urlResponse.data && urlResponse.data[0] && urlResponse.data[0].url) {
            const musicUrl = urlResponse.data[0].url;
            console.log('Playing music from URL:', musicUrl);

            // 创建一个临时的单曲列表用于FM播放（不影响用户的真实播放列表）
            const fmSongList = [
                {
                    id: currentSong.value.id,
                    name: currentSong.value.name,
                    ar: currentSong.value.artists || [],
                    al: currentSong.value.album || {},
                    dt: currentSong.value.dt || currentSong.value.duration || 0,
                    duration: currentSong.value.dt || currentSong.value.duration || 0,
                    type: 'fm',
                },
            ];

            // 设置播放器状态
            playerStore.songId = currentSong.value.id;
            playerStore.currentIndex = 0;
            playerStore.songList = fmSongList;
            playerStore.listInfo = {
                id: 'personalfm',
                type: 'personalfm',
                name: '私人漫游',
            };

            // 直接播放音乐
            play(musicUrl, true);

            // 获取歌词
            try {
                const lyricResponse = await getLyric(currentSong.value.id);
                if (lyricResponse && lyricResponse.lrc) {
                    playerStore.lyric = lyricResponse;
                }
            } catch (lyricError) {
                console.warn('Failed to load lyrics:', lyricError);
            }

            console.log('FM song started playing successfully');
        } else {
            console.error('No valid music URL found');
        }
    } catch (error) {
        console.error('Error playing FM song:', error);
    }
};

const nextSong = async () => {
    // 如果有下一首已播放的歌曲，直接播放
    if (currentIndex.value < playedSongs.value.length - 1) {
        currentIndex.value++;
        if (currentSong.value) {
            console.log('Playing next FM song from history:', currentSong.value.name);
            await togglePlay();
        }
        return;
    }

    // 如果没有下一首，需要获取新歌曲
    if (fmSongs.value.length === 0) {
        await refreshFM();
    }

    // 从未播放的歌曲中取下一首
    const nextSongFromPool = fmSongs.value.shift();
    if (nextSongFromPool) {
        // 添加到播放历史
        playedSongs.value.push(nextSongFromPool);
        currentIndex.value = playedSongs.value.length - 1;

        console.log('Playing new FM song:', nextSongFromPool.name);
        await togglePlay();
    } else {
        console.log('No more FM songs available');
        // 如果歌曲池为空，尝试再次刷新
        if (fmSongs.value.length === 0) {
            await refreshFM();
            // 再次尝试获取歌曲
            const retryNextSong = fmSongs.value.shift();
            if (retryNextSong) {
                playedSongs.value.push(retryNextSong);
                currentIndex.value = playedSongs.value.length - 1;
                console.log('Playing retry FM song:', retryNextSong.name);
                await togglePlay();
            }
        }
    }
};

const prevSong = async () => {
    if (currentIndex.value > 0) {
        currentIndex.value--;
        if (currentSong.value) {
            console.log('Playing previous FM song:', currentSong.value.name);
            await togglePlay();
        }
    } else {
        console.log('Already at first song, cannot go to previous');
    }
};

const trashSong = async () => {
    if (!currentSong.value) return;

    try {
        await fmTrash(currentSong.value.id);
        nextSong();
    } catch (error) {
        console.warn('FM trash failed, skipping to next song:', error);
        nextSong();
    }
};

const likeSong = async () => {
    if (!currentSong.value) return;

    try {
        const isLiked = !currentSong.value.liked;
        await likeMusic(currentSong.value.id, isLiked);
        currentSong.value.liked = isLiked;
    } catch (error) {
        console.error('Failed to like song:', error);
    }
};

const refreshFM = async () => {
    loading.value = true;
    try {
        console.log('Requesting Personal FM data...');

        // 首先尝试官方Personal FM API
        try {
            const response = await getPersonalFM();
            console.log('Personal FM response:', response);

            if (response && response.data && response.data.length > 0) {
                // 追加到歌曲池，而不是替换
                fmSongs.value.push(...response.data);
                console.log('Added FM songs to pool:', response.data.length);

                // 如果当前没有歌曲在播放历史中，从池中取第一首歌开始播放
                if (playedSongs.value.length === 0 && fmSongs.value.length > 0) {
                    const firstSong = fmSongs.value.shift();
                    playedSongs.value.push(firstSong);
                    currentIndex.value = 0;
                    console.log('Started with first FM song:', firstSong.name);
                }
                return;
            }
        } catch (fmError) {
            console.warn('Personal FM API failed, trying daily recommendations:', fmError);
        }

        // 如果Personal FM失败，使用每日推荐作为备选
        try {
            const recResponse = await getRecommendSongs();
            console.log('Daily recommendations response:', recResponse);

            if (recResponse && recResponse.data && recResponse.data.dailySongs) {
                const songs = mapSongsPlayableStatus(recResponse.data.dailySongs);
                // 随机打乱歌曲顺序，模拟FM效果
                const shuffledSongs = songs.sort(() => Math.random() - 0.5);
                // 追加到歌曲池
                fmSongs.value.push(...shuffledSongs);
                console.log('Added daily recommendation songs to FM pool:', shuffledSongs.length);

                // 如果当前没有歌曲在播放历史中，从池中取第一首歌开始播放
                if (playedSongs.value.length === 0 && fmSongs.value.length > 0) {
                    const firstSong = fmSongs.value.shift();
                    playedSongs.value.push(firstSong);
                    currentIndex.value = 0;
                    console.log('Started with first recommendation song:', firstSong.name);
                }
                return;
            }
        } catch (recError) {
            console.warn('Daily recommendations also failed:', recError);
        }

        // 如果所有API都失败，显示空状态
        console.error('All FM data sources failed');
    } catch (error) {
        console.error('All FM data sources failed:', error);
    } finally {
        loading.value = false;
    }
};

onMounted(() => {
    // 只有在FM列表为空时才加载新歌
    if (playedSongs.value.length === 0) {
        refreshFM();
    }

    // 确保FM模式使用正确的播放模式
    if (playerStore.playMode !== 2 && playerStore.playMode !== 3) {
        playerStore.playMode = 2;
    }

    // 监听播放器控制事件
    window.addEventListener('fmPlayModeResponse', handleFMPlayModeResponse);
    window.addEventListener('fmPreviousResponse', handleFMPreviousResponse);
    window.addEventListener('fmNextResponse', handleFMNextResponse);
});

onUnmounted(() => {
    // 清理所有事件监听器
    window.removeEventListener('fmPlayModeResponse', handleFMPlayModeResponse);
    window.removeEventListener('fmPreviousResponse', handleFMPreviousResponse);
    window.removeEventListener('fmNextResponse', handleFMNextResponse);
});

// 处理播放模式响应
const handleFMPlayModeResponse = async event => {
    const { action } = event.detail;
    console.log('Received FM play mode response:', action);

    if (action === 'loop') {
        // 单曲循环模式：重新播放当前歌曲
        console.log('Loop mode: replaying current song');
        await togglePlay();
    } else if (action === 'next') {
        // FM模式：播放下一首漫游歌曲
        console.log('FM mode: playing next song');
        await nextSong();
    }
};

// 处理上一首FM歌曲响应
const handleFMPreviousResponse = async event => {
    const { action } = event.detail;
    console.log('Received FM previous response:', action);

    if (action === 'previous') {
        console.log('Playing previous FM song from player controls');
        await prevSong();
    }
};

// 处理下一首FM歌曲响应
const handleFMNextResponse = async event => {
    const { action } = event.detail;
    console.log('Received FM next response:', action);

    if (action === 'next') {
        console.log('Playing next FM song from player controls');
        await nextSong();
    }
};
</script>

<style scoped lang="scss">
.personal-fm {
    padding-top: 40px;
    height: 100%;
    overflow: auto;

    &::-webkit-scrollbar {
        display: none;
    }

    h1 {
        margin: 0;
        color: black;
    }

    .fm-subtitle {
        margin: 4px 0 30px 0;
        font: 14px SourceHanSansCN-Bold;
        color: black;
        display: block;
    }
}

.fm-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 30px;
}

.fm-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}

.fm-cover {
    position: relative;
    width: 200px;
    height: 200px;
    cursor: pointer;

    img {
        width: 100%;
        height: 100%;
        border-radius: 8px;
        object-fit: cover;
        border: 0.5px solid rgb(233, 233, 233);
    }

    .fm-play-overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.8;
        transition: all 0.3s ease;
        z-index: 10;
        pointer-events: none;
    }

    &:hover .fm-play-overlay {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.1);
    }
}

.fm-info {
    text-align: center;

    .song-name {
        font: 20px SourceHanSansCN-Bold;
        color: black;
        margin: 0 0 8px 0;
    }

    .artist-name {
        font: 14px SourceHanSansCN-Bold;
        color: rgb(78, 78, 78);
        margin: 0 0 4px 0;
    }

    .album-name {
        font: 12px SourceHanSansCN-Bold;
        color: rgb(107, 107, 107);
        margin: 0;
    }
}

.fm-actions {
    display: flex;
    gap: 20px;
    align-items: center;
}

.action-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    color: rgb(78, 78, 78);

    &:hover {
        background: rgba(0, 0, 0, 0.1);
        color: black;
    }

    &.trash:hover {
        background: rgba(255, 59, 48, 0.1);
        color: rgb(255, 59, 48);
    }

    &.like.active {
        background: rgba(255, 59, 48, 0.1);
        color: rgb(255, 59, 48);
    }

    &.like:hover {
        background: rgba(255, 59, 48, 0.1);
        color: rgb(255, 59, 48);
    }

    &.prev,
    &.next {
        background: rgba(0, 0, 0, 0.8);
        color: white;

        &:hover {
            background: rgba(0, 0, 0, 0.9);
        }
    }
}

.fm-loading,
.fm-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: rgb(78, 78, 78);
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top: 3px solid black;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.empty-icon {
    margin-bottom: 20px;
    color: rgb(107, 107, 107);
}

.error-hint {
    font-size: 12px;
    color: rgb(150, 150, 150);
    margin: 5px 0;
}

.refresh-button {
    margin-top: 20px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
    font: 14px SourceHanSansCN-Bold;
    color: black;

    &:hover {
        background: rgba(0, 0, 0, 0.1);
    }
}
</style>
