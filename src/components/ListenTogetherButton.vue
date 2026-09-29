<script setup>
import { useListenTogetherStore } from '../store/listenTogetherStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
defineProps({ compact: Boolean })
const together = useListenTogetherStore()
const player = usePlayerStore()
const user = useUserStore()

function toggle() {
    if (together.show) {
        together.show = false
        return
    }
    player.playlistWidgetShow = false
    together.open()
}
</script>

<template>
    <button v-if="!user.localOnlyMode" type="button" class="listen-together-button" :class="{ active: together.state.roomId || together.show, compact }" :title="together.show ? '收起一起听' : together.state.roomId ? '打开一起听控制' : '一起听 · 邀请好友或加入房间'" aria-label="打开或收起一起听控制" :aria-expanded="together.show" @click.stop="toggle">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/><path d="M9 14l3 3 3-3"/></svg>
        <span v-if="!compact">{{ together.state.roomId ? '正在一起听' : '一起听' }}</span>
        <i v-if="together.state.roomId" aria-hidden="true" />
    </button>
</template>

<style scoped>
.listen-together-button { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 6px; min-height: 30px; border: 0; border-radius: 5px; padding: 4px 7px; background: transparent; color: var(--text, #202b2e); cursor: pointer; font: inherit; font-size: 12px; -webkit-app-region: no-drag; }
.listen-together-button.compact { padding: 4px; }
.listen-together-button:hover { background: rgba(110, 156, 169, .16); }
.listen-together-button.active { color: #448a9c; }
.listen-together-button:focus-visible { outline: 2px solid #448a9c; outline-offset: 2px; }
i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; position: absolute; top: 1px; right: 1px; }
</style>
