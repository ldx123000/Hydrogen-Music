<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useListenTogetherStore } from '../store/listenTogetherStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import ListenTogetherFriends from './ListenTogetherFriends.vue'

defineProps({ active: Boolean })

const together = useListenTogetherStore()
const player = usePlayerStore()
const user = useUserStore()
const router = useRouter()

const invitation = ref('')
const inviter = ref('')
const entryTab = ref('invite')
const elapsed = ref(0)

const loggedIn = computed(() => !!user.user?.userId && !user.localOnlyMode)
const song = computed(() => player.songList?.[player.currentIndex])
const elapsedLabel = computed(() => `${Math.floor(elapsed.value / 60)}:${String(elapsed.value % 60).padStart(2, '0')}`)
const connectionLabel = computed(() => {
    if (together.state.connection === 'reconnecting') return '重连中'
    if (together.state.connection === 'connecting') return '连接中'
    return together.state.roomId ? '已同步' : '未连接'
})

const clockTimer = setInterval(() => {
    elapsed.value = together.state.connectedAt
        ? Math.max(0, Math.floor((Date.now() - together.state.connectedAt) / 1000))
        : 0
}, 1000)

onBeforeUnmount(() => clearInterval(clockTimer))

function openPlaylist() {
    together.show = false
    player.playlistWidgetShow = true
}

function login() {
    together.show = false
    player.widgetState = true
    router.push('/login')
}
</script>

<template>
    <Transition name="together-inline">
        <section
            v-if="active && together.show"
            class="listen-together-inline"
            aria-label="一起听控制"
        >
            <header class="together-header">
                <div class="header-title">
                    <strong>一起听</strong>
                    <div class="header-state">
                        <span v-if="together.state.roomId" class="status-dot" :class="{ reconnecting: together.state.connection === 'reconnecting' }" />
                        <small>{{ together.state.roomId ? `${connectionLabel} · ${together.state.users.length || 1} 人` : '与好友同步播放' }}</small>
                        <time v-if="together.state.roomId">{{ elapsedLabel }}</time>
                    </div>
                </div>
                <button class="close-button" type="button" aria-label="收起一起听" title="收起" @click="together.show = false">
                    <svg width="16" height="16" viewBox="2.7 2.7 18.6 18.6" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg>
                </button>
            </header>

            <div class="together-content">
                <div v-if="!loggedIn" class="empty-state">
                    <span>登录网易云账号后可恢复、创建或加入官方一起听房间。</span>
                    <button class="primary" type="button" @click="login">登录网易云</button>
                </div>

                <template v-else-if="!together.state.roomId">
                    <div class="segment-control" role="tablist" aria-label="一起听连接方式">
                        <button role="tab" :aria-selected="entryTab === 'invite'" @click="entryTab = 'invite'">邀请好友</button>
                        <button role="tab" :aria-selected="entryTab === 'join'" @click="entryTab = 'join'">加入房间</button>
                    </div>
                    <div v-if="entryTab === 'invite'" class="entry-layout">
                        <ListenTogetherFriends />
                    </div>
                    <form v-else class="join-form" @submit.prevent="together.join(invitation, inviter)">
                        <label>邀请链接或房间 ID<input v-model="invitation" placeholder="粘贴好友发来的邀请链接" autocomplete="off" :disabled="together.state.busy" /></label>
                        <label class="inviter-field">邀请者 ID<input v-model="inviter" inputmode="numeric" placeholder="使用房间 ID 时填写" :disabled="together.state.busy" /></label>
                        <div class="form-actions">
                            <button class="primary" :disabled="together.state.busy || !invitation.trim()">{{ together.state.busy ? '加入中' : '加入一起听' }}</button>
                            <button type="button" :disabled="together.state.busy" @click="together.restore()">恢复账号房间</button>
                        </div>
                    </form>
                </template>

                <template v-else>
                    <div class="header-song">
                        <span class="section-label">{{ together.state.applying ? '正在跟随对方' : together.supported ? '当前共享' : '等待网易云歌曲' }}</span>
                        <strong :title="song?.name">{{ song?.name || '暂无歌曲' }}</strong>
                    </div>
                    <div class="playlist-handoff">
                        <div>
                            <strong>当前播放列表</strong>
                            <span>{{ player.songList?.length || 0 }} 首歌曲</span>
                        </div>
                        <button class="text-button" type="button" @click.stop="openPlaylist">打开列表 <span aria-hidden="true">↗</span></button>
                    </div>

                    <div class="people-pane">
                        <span class="section-label">房间成员</span>
                        <ul class="members" aria-label="房间成员">
                            <li v-for="member in together.state.users" :key="member.userId">
                                <img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" referrerpolicy="no-referrer" />
                                <span class="avatar-fallback" v-else>{{ (member.nickname || '网').slice(0, 1) }}</span>
                                <div><strong>{{ member.nickname || '网易云用户' }}</strong><small>{{ String(member.userId) === String(together.state.creatorId) ? '房主' : '成员' }}</small></div>
                            </li>
                        </ul>
                        <p v-if="!together.state.users.length" class="muted">房间已连接，等待好友加入。</p>
                        <div class="room-actions">
                            <button type="button" :disabled="together.state.busy || together.state.applying" @click="together.refresh({ force: true })">重新同步</button>
                            <button class="danger" type="button" :disabled="together.state.busy" @click="together.leave()">退出一起听</button>
                        </div>
                    </div>
                </template>

                <p v-if="together.state.error" class="error" role="alert">{{ together.state.error }}</p>
            </div>
        </section>
    </Transition>
</template>

<style scoped lang="scss">
.listen-together-inline {
    position: absolute;
    left: calc(100% + 60px);
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: 310px;
    max-width: calc(100vw - 60px);
    max-height: 100%;
    // 保留主题色，使用不透明背景遮住底层歌词。
    background: rgb(from var(--player-panel) r g b / 1);
    color: var(--text);
    font: 13px SourceHanSansCN-Bold, sans-serif;
    text-align: left;
    z-index: 140;

    // 与设置页的直角控件一致，同时覆盖浏览器默认的彩色焦点环。
    :deep(button), :deep(input) {
        appearance: none;
        outline: none;
        border: 0;
        border-radius: 0;
        color: var(--text);
        font: inherit;
    }
    :deep(button) {
        min-height: 30px;
        padding: 5px 12px;
        line-height: 20px;
        background: var(--layer) !important;
        transition: box-shadow .2s, opacity .2s;
        &:hover:not(:disabled), &:focus-visible { box-shadow: 0 0 0 1px var(--text); }
        &:active:not(:disabled) { opacity: .8; }
        &:disabled { opacity: .4; cursor: default; }
    }
    :deep(input) {
        min-height: 34px;
        padding: 7px 10px;
        background: var(--layer);
        transition: box-shadow .2s;
        &:focus { box-shadow: inset 0 -1px 0 var(--text); }
    }
    button.primary {
        background: var(--text) !important;
        color: var(--bg) !important;
        &:hover:not(:disabled) { opacity: .8; }
    }
    .muted, .section-label, .header-state small { color: var(--muted-text) !important; }
}
.together-header {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin: 0 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
}
.header-title { min-width: 0; }
.header-title > strong { display: block; font-size: 16px; line-height: 1.5; }
.header-state {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 4px;
    small { font-size: 12px; }
    time { margin-left: 5px; font: 12px Bender-Bold, sans-serif; font-variant-numeric: tabular-nums; }
}
.status-dot {
    width: 4px;
    height: 4px;
    background: var(--text);
    &.reconnecting { background: transparent; outline: 1px solid var(--text); }
}
.listen-together-inline .close-button {
    display: grid;
    place-items: center;
    min-height: 24px;
    width: 24px;
    padding: 3px;
    margin: 0 -4px 0 0;
    border: 0;
    background: transparent !important;
    &:hover:not(:disabled) { box-shadow: none; opacity: .65; }
    &:focus-visible:not(:disabled) { box-shadow: 0 0 0 1px var(--text); }
}
.together-content {
    min-height: 0;
    padding: 12px 12px 16px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
}
.segment-control {
    display: flex;
    gap: 16px;
    margin: -4px 0 12px;
    border-bottom: 1px solid var(--border);
    button {
        padding: 6px 4px;
        border: 0;
        border-bottom: 2px solid transparent !important;
        background: transparent !important;
        color: var(--muted-text) !important;
        &[aria-selected="true"] { border-bottom-color: var(--text) !important; color: var(--text) !important; }
        &:hover:not(:disabled) { color: var(--text) !important; box-shadow: none; }
        &:focus-visible:not(:disabled) { box-shadow: inset 0 0 0 1px var(--text); }
    }
}
.empty-state {
    display: grid;
    justify-items: start;
    gap: 20px;
    padding: 6px 0;
    line-height: 1.8;
    span { color: var(--muted-text) !important; }
}
.join-form {
    display: grid;
    gap: 14px;
    label { display: grid; gap: 7px; font-size: 12px; }
    input { width: 100%; font-size: 13px; }
}
.form-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.header-song {
    display: grid;
    gap: 6px;
    margin-bottom: 16px;
    strong { font-size: 16px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.section-label { display: block; font-size: 11px; }
.playlist-handoff {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    margin-bottom: 20px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    > div { display: grid; gap: 3px; }
    strong { font-size: 12px; }
    > div > span { font-size: 11px; color: var(--muted-text) !important; }
    button { white-space: nowrap; font-size: 12px; }
}
.members {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin: 12px 0 20px;
    padding: 0;
    list-style: none;
    li { min-width: 0; display: flex; align-items: center; gap: 9px; }
    img, .avatar-fallback { width: 32px; height: 32px; flex: 0 0 32px; object-fit: cover; }
    .avatar-fallback { display: grid; place-items: center; border: 1px solid var(--border); }
    li > div { min-width: 0; display: grid; gap: 2px; }
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    small { font-size: 10px; color: var(--muted-text) !important; }
}
.muted { margin-bottom: 16px; font-size: 12px; }
.room-actions { display: flex; justify-content: space-between; gap: 12px; padding-top: 16px; border-top: 1px solid var(--border); }
.error { margin: 16px 0 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--text); font-size: 12px; line-height: 1.7; }
.together-inline-enter-active, .together-inline-leave-active { transition: opacity .18s, transform .22s cubic-bezier(.19, .8, .49, .99); }
.together-inline-enter-from, .together-inline-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 900px) {
    .listen-together-inline { left: 0; width: max(100%, 310px); }
}
</style>
