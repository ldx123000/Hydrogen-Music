<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useListenTogetherStore } from '../store/listenTogetherStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'

const together = useListenTogetherStore()
const player = usePlayerStore()
const user = useUserStore()

let disposed = false
let pollTimer
let updateTimer
let pendingSeek = false
let pollGeneration = 0
let automaticRestoreReady = false

function scheduleUpdate(seek = false) {
    if (together.state.applying || !together.state.roomId) return
    pendingSeek ||= seek
    clearTimeout(updateTimer)
    updateTimer = setTimeout(() => {
        const shouldSeek = pendingSeek
        pendingSeek = false
        void together.update({ seek: shouldSeek })
    }, 200)
}

async function poll(generation) {
    await together.refresh()
    if (!disposed && generation === pollGeneration && together.state.roomId) {
        pollTimer = setTimeout(() => poll(generation), together.state.pollDelay)
    }
}

const onSeek = () => scheduleUpdate(true)
const onAutomaticRestoreReady = () => {
    automaticRestoreReady = true
    if (user.user?.userId && !user.localOnlyMode) void together.restore({ silent: true })
}
const onEnded = event => {
    if (!together.state.roomId || !together.supported || player.playMode === 2) return
    event.preventDefault()
    const ids = together.state.users.map(member => String(member.userId))
    const leader = ids.includes(together.state.creatorId)
        ? together.state.creatorId
        : ids.sort((a, b) => Number(a) - Number(b))[0]
    if (!leader || leader === String(user.user?.userId)) {
        void import('../utils/player').then(({ playNext }) => playNext())
    }
}

watch(() => together.state.roomId, roomId => {
    player.togetherRoomActive = !!roomId
    clearTimeout(pollTimer)
    const generation = ++pollGeneration
    if (roomId) pollTimer = setTimeout(() => poll(generation), together.state.pollDelay)
})

watch(() => player.playlistWidgetShow, shown => {
    if (shown) together.show = false
})

watch(() => [player.songId, player.playing, player.currentMusic, player.playMode,
    player.songList?.map(song => song.id).join(','), player.shuffledList?.map(song => song.id).join(',')],
() => scheduleUpdate(), { flush: 'post' })

watch(() => [user.user?.userId, user.localOnlyMode], ([userId, localOnly]) => {
    clearTimeout(updateTimer)
    pendingSeek = false
    together.reset()
    together.show = false
    if (!automaticRestoreReady || !userId || localOnly) return
    void together.restore({ silent: true })
})

onMounted(() => {
    window.addEventListener('mediaSession:seeked', onSeek)
    window.addEventListener('listentogether:ended', onEnded)
    window.addEventListener('listenTogether:startup-ready', onAutomaticRestoreReady, { once: true })
})

onBeforeUnmount(() => {
    disposed = true
    clearTimeout(pollTimer)
    clearTimeout(updateTimer)
    window.removeEventListener('mediaSession:seeked', onSeek)
    window.removeEventListener('listentogether:ended', onEnded)
    window.removeEventListener('listenTogether:startup-ready', onAutomaticRestoreReady)
    together.reset()
})
</script>

<template></template>
