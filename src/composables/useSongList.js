/**
 * useSongList - 歌曲列表相关的通用逻辑
 * 提供列表操作、选择、播放等功能
 */

import { ref, computed, nextTick } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { formatDuration, formatPlayCount, getFriendlyTime } from '../utils/time'

export function useSongList(initialList = []) {
    const playerStore = usePlayerStore()
    const userStore = useUserStore()
    
    // 本地状态
    const songs = ref(initialList)
    const selectedSongs = ref(new Set())
    const isSelectMode = ref(false)
    const loading = ref(false)
    const error = ref(null)

    // 计算属性
    const songCount = computed(() => songs.value.length)
    const selectedCount = computed(() => selectedSongs.value.size)
    const hasSelected = computed(() => selectedCount.value > 0)
    const isAllSelected = computed(() => 
        songCount.value > 0 && selectedCount.value === songCount.value
    )

    // 格式化歌曲数据
    const formattedSongs = computed(() => {
        return songs.value.map(song => ({
            ...song,
            formattedDuration: formatDuration(song.dt / 1000),
            formattedPlayCount: song.playCount ? formatPlayCount(song.playCount) : '',
            formattedPublishTime: song.publishTime ? getFriendlyTime(song.publishTime) : '',
            isLiked: userStore.likedSongs?.includes(song.id) || false,
            isCurrentPlaying: playerStore.songId === song.id && playerStore.playing
        }))
    })

    // 列表操作方法
    const setSongs = (newSongs) => {
        songs.value = newSongs || []
        clearSelection()
    }

    const addSong = (song) => {
        if (!songs.value.find(s => s.id === song.id)) {
            songs.value.push(song)
        }
    }

    const removeSong = (songId) => {
        const index = songs.value.findIndex(s => s.id === songId)
        if (index !== -1) {
            songs.value.splice(index, 1)
            selectedSongs.value.delete(songId)
        }
    }

    const removeSongs = (songIds) => {
        songIds.forEach(id => removeSong(id))
    }

    const insertSong = (song, index) => {
        if (index >= 0 && index <= songs.value.length) {
            songs.value.splice(index, 0, song)
        }
    }

    const moveSong = (fromIndex, toIndex) => {
        if (fromIndex !== toIndex && 
            fromIndex >= 0 && fromIndex < songs.value.length &&
            toIndex >= 0 && toIndex < songs.value.length) {
            const song = songs.value.splice(fromIndex, 1)[0]
            songs.value.splice(toIndex, 0, song)
        }
    }

    // 选择操作
    const toggleSelection = (songId) => {
        if (selectedSongs.value.has(songId)) {
            selectedSongs.value.delete(songId)
        } else {
            selectedSongs.value.add(songId)
        }
    }

    const selectAll = () => {
        selectedSongs.value = new Set(songs.value.map(s => s.id))
    }

    const clearSelection = () => {
        selectedSongs.value.clear()
    }

    const selectRange = (startIndex, endIndex) => {
        const start = Math.min(startIndex, endIndex)
        const end = Math.max(startIndex, endIndex)
        
        for (let i = start; i <= end && i < songs.value.length; i++) {
            selectedSongs.value.add(songs.value[i].id)
        }
    }

    const toggleSelectMode = () => {
        isSelectMode.value = !isSelectMode.value
        if (!isSelectMode.value) {
            clearSelection()
        }
    }

    const getSelectedSongs = () => {
        return songs.value.filter(song => selectedSongs.value.has(song.id))
    }

    // 播放操作
    const playAll = () => {
        if (songs.value.length > 0) {
            playerStore.setSongList(songs.value)
            playerStore.setCurrentIndex(0)
            playerStore.setPlaying(true)
        }
    }

    const playSong = (song, index = null) => {
        const targetIndex = index !== null ? index : songs.value.findIndex(s => s.id === song.id)
        
        if (targetIndex !== -1) {
            playerStore.setSongList(songs.value)
            playerStore.setCurrentIndex(targetIndex)
            playerStore.setPlaying(true)
        }
    }

    const playSelected = () => {
        const selectedSongList = getSelectedSongs()
        if (selectedSongList.length > 0) {
            playerStore.setSongList(selectedSongList)
            playerStore.setCurrentIndex(0)
            playerStore.setPlaying(true)
        }
    }

    const addToPlaylist = () => {
        if (songs.value.length > 0) {
            const currentList = playerStore.songList || []
            const newList = [...currentList, ...songs.value]
            playerStore.setSongList(newList)
        }
    }

    const addSelectedToPlaylist = () => {
        const selectedSongList = getSelectedSongs()
        if (selectedSongList.length > 0) {
            const currentList = playerStore.songList || []
            const newList = [...currentList, ...selectedSongList]
            playerStore.setSongList(newList)
        }
    }

    // 搜索和过滤
    const searchSongs = (keyword) => {
        if (!keyword) return formattedSongs.value
        
        const lowerKeyword = keyword.toLowerCase()
        return formattedSongs.value.filter(song => 
            song.name?.toLowerCase().includes(lowerKeyword) ||
            song.ar?.[0]?.name?.toLowerCase().includes(lowerKeyword) ||
            song.al?.name?.toLowerCase().includes(lowerKeyword)
        )
    }

    const filterByArtist = (artistName) => {
        return formattedSongs.value.filter(song => 
            song.ar?.some(artist => artist.name === artistName)
        )
    }

    const filterByAlbum = (albumName) => {
        return formattedSongs.value.filter(song => 
            song.al?.name === albumName
        )
    }

    // 排序
    const sortSongs = (key, direction = 'asc') => {
        songs.value.sort((a, b) => {
            let aValue = a[key]
            let bValue = b[key]
            
            // 处理嵌套属性
            if (key.includes('.')) {
                const keys = key.split('.')
                aValue = keys.reduce((obj, k) => obj?.[k], a)
                bValue = keys.reduce((obj, k) => obj?.[k], b)
            }
            
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase()
                bValue = bValue.toLowerCase()
            }
            
            if (direction === 'asc') {
                return aValue > bValue ? 1 : -1
            } else {
                return aValue < bValue ? 1 : -1
            }
        })
    }

    // 右键菜单相关
    const showContextMenu = ref(false)
    const contextMenuPosition = ref({ x: 0, y: 0 })
    const contextMenuSong = ref(null)

    const handleRightClick = (event, song) => {
        event.preventDefault()
        contextMenuSong.value = song
        contextMenuPosition.value = { x: event.clientX, y: event.clientY }
        showContextMenu.value = true
        
        // 点击其他地方关闭菜单
        nextTick(() => {
            const closeMenu = () => {
                showContextMenu.value = false
                document.removeEventListener('click', closeMenu)
            }
            document.addEventListener('click', closeMenu)
        })
    }

    return {
        // 状态
        songs,
        selectedSongs,
        isSelectMode,
        loading,
        error,
        showContextMenu,
        contextMenuPosition,
        contextMenuSong,
        
        // 计算属性
        songCount,
        selectedCount,
        hasSelected,
        isAllSelected,
        formattedSongs,
        
        // 列表操作
        setSongs,
        addSong,
        removeSong,
        removeSongs,
        insertSong,
        moveSong,
        
        // 选择操作
        toggleSelection,
        selectAll,
        clearSelection,
        selectRange,
        toggleSelectMode,
        getSelectedSongs,
        
        // 播放操作
        playAll,
        playSong,
        playSelected,
        addToPlaylist,
        addSelectedToPlaylist,
        
        // 搜索和过滤
        searchSongs,
        filterByArtist,
        filterByAlbum,
        
        // 排序
        sortSongs,
        
        // 右键菜单
        handleRightClick
    }
}