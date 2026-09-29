<script setup>
import { useListenTogetherStore } from '../store/listenTogetherStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
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
    <button v-if="!user.localOnlyMode" type="button" class="listen-together-button" :class="{ active: together.show }" :title="together.show ? '收起一起听' : together.state.roomId ? '正在一起听 · 打开房间' : '一起听 · 邀请好友或加入房间'" aria-label="打开或收起一起听控制" :aria-expanded="together.show" @click.stop="toggle">
        <svg width="24" height="24" viewBox="0.24 -0.26 23.52 23.52" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path fill="none" d="M4 13v-2a8 8 0 0 1 16 0v2"/><path fill="none" d="M3 12h4v8H3zM17 12h4v8h-4z"/></svg>
        <i v-if="together.state.roomId" aria-hidden="true" />
    </button>
</template>

<style scoped>
.listen-together-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--player-action-icon-size);
    height: var(--player-action-icon-size);
    padding: 0;
    border: 0;
    border-radius: 0;
    appearance: none;
    outline: none;
    background: transparent;
    color: var(--text);
    opacity: .5;
    transition: opacity .2s, transform .2s;
    -webkit-app-region: no-drag;
}
.listen-together-button:hover { opacity: .8; }
.listen-together-button.active { opacity: 1; }
.listen-together-button:active { transform: scale(.9); }
.listen-together-button:focus-visible { box-shadow: 0 0 0 1px var(--text); }
svg { width: var(--player-action-icon-size); height: var(--player-action-icon-size); flex-shrink: 0; }
i { width: 4px; height: 4px; background: var(--text); position: absolute; top: -2px; right: -2px; }
:global(.dark .listen-together-button) { background: transparent !important; }
</style>
