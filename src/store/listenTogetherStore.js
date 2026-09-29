import { computed, nextTick, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { usePlayerStore } from './playerStore'
import { useUserStore } from './userStore'
import { togetherRequest } from '../api/listenTogether'
import { getSongDetail } from '../api/song'
import { createTogetherSession, createTogetherState, isTogetherSong, localPlayMode } from '../utils/listenTogether'

export const useListenTogetherStore = defineStore('listenTogether', () => {
    const player = usePlayerStore()
    const user = useUserStore()
    const show = ref(false)
    const state = reactive(createTogetherState())
    const currentSong = computed(() => player.songList?.[player.currentIndex])
    const supported = computed(() => isTogetherSong(currentSong.value))
    const songCache = new Map()
    async function details(ids, active) {
        for (const song of player.songList || []) if (isTogetherSong(song)) songCache.set(String(song.id), song)
        const missing = ids.filter(id => !songCache.has(String(id)))
        for (let offset = 0; offset < missing.length; offset += 200) {
            const result = await getSongDetail(missing.slice(offset, offset + 200))
            if (!active()) return []
            if (result.code !== 200 || !Array.isArray(result.songs)) throw new Error('房间歌曲加载失败，请重试')
            for (const song of result.songs) songCache.set(String(song.id), song)
        }
        return ids.map(id => songCache.get(String(id))).filter(Boolean)
    }
    async function applyRemote({ ids, randomIds, mode, command, position }, active) {
        const targetId = command?.targetSongId != null ? String(command.targetSongId) : String(player.songId || '')
        const desiredIds = ids === null ? (player.songList || []).filter(isTogetherSong).map(song => String(song.id)) : [...ids]
        if (targetId && !desiredIds.includes(targetId)) desiredIds.push(targetId)
        const songs = await details(desiredIds, active)
        if (!active()) return
        const songsById = new Map(songs.map(song => [String(song.id), song]))
        const target = songsById.get(targetId)
        if (command && !target) throw new Error('房间当前歌曲暂不可用，请稍后重试')
        const playerApi = await import('../utils/player')
        if (!active()) return
        if (ids !== null || (command && !player.songList?.some(song => String(song.id) === targetId))) {
            playerApi.addToList('together', songs, null, { persist: false })
            const index = songs.findIndex(song => String(song.id) === String(player.songId))
            if (index >= 0) player.currentIndex = index
            // Leaving personal FM restores its previous mode in a watcher.
            // Let that finish before applying the room's mode and shuffle order.
            await nextTick()
            if (!active()) return
        }
        if (player.playMode !== localPlayMode(mode)) playerApi.applyPlayMode(localPlayMode(mode))
        if (mode === 'RANDOM') {
            player.shuffledList = randomIds.map(id => songsById.get(id)).filter(Boolean)
            player.shuffleIndex = Math.max(0, player.shuffledList.findIndex(song => String(song.id) === targetId))
        }
        if (command) {
            const changed = String(player.songId) !== targetId || !player.currentMusic
            if (changed) {
                const index = songs.findIndex(song => String(song.id) === targetId)
                playerApi.addSong(target.id, mode === 'RANDOM' ? player.shuffleIndex : index, false)
            }
            // Audio loading is asynchronous. Apply the latest clock only after the new
            // track is loaded, never seek the old track or report intermediate pauses.
            const deadline = Date.now() + 15000
            while (active() && String(player.songId) === targetId && player.currentMusic?.state?.() !== 'loaded') {
                if (Date.now() > deadline) throw new Error('歌曲加载超时，可能没有播放权限；将自动重试')
                await new Promise(resolve => setTimeout(resolve, 100))
            }
            if (!active()) return
            if (String(player.songId) !== targetId) throw new Error('房间当前歌曲未能加载，请重新同步')
            // Howler resumes a playing HTML5 track asynchronously after a seek.
            // Finish pausing first so that resume cannot undo a remote pause.
            if (command.playStatus === 'PAUSE' && player.playing) {
                playerApi.pauseMusic()
                while (active() && player.playing && String(player.songId) === targetId) {
                    if (Date.now() > deadline) throw new Error('暂停歌曲超时，请重新同步')
                    await new Promise(resolve => setTimeout(resolve, 50))
                }
                if (!active()) return
                if (String(player.songId) !== targetId) throw new Error('房间当前歌曲已变化，请重新同步')
            }
            const desiredPosition = Math.min(position(), Math.max(0, (Number(player.time) || Infinity) - 0.25))
            if (changed || Math.abs(player.progress - desiredPosition) > 1.5 || command.commandType === 'PROGRESS') playerApi.changeProgress(desiredPosition)
            if (command.playStatus === 'PLAY' && !player.playing) playerApi.startMusic()
        }
        await nextTick()
        if (active()) playerApi.savePlaylist()
    }
    const session = createTogetherSession({ state, api: togetherRequest,
        userId: () => user.localOnlyMode ? null : user.user?.userId,
        playback: () => ({ song: currentSong.value, songs: player.songList, shuffledSongs: player.shuffledList,
            playMode: player.playMode, playing: player.playing, progress: player.progress,
            ready: player.currentMusic?.state?.() === 'loaded' }),
        applyRemote,
    })
    function open() { show.value = true }
    function reset() { player.togetherRoomActive = false; session.reset(); songCache.clear() }
    return { show, state, supported, open, ...session, reset }
})
