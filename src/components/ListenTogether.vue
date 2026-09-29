<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useListenTogetherStore } from '../store/listenTogetherStore'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import ListenTogetherFriends from './ListenTogetherFriends.vue'

const props = defineProps({
    active: Boolean,
    variant: { type: String, default: 'widget' },
})

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
            :class="`listen-together-inline--${variant}`"
            aria-label="一起听控制"
        >
            <header class="together-header">
                <div class="header-state">
                    <span class="status-dot" :class="{ idle: !together.state.roomId, warning: together.state.connection === 'reconnecting' }" />
                    <div>
                        <strong>{{ together.state.roomId ? '一起听' : '连接一起听' }}</strong>
                        <small>{{ together.state.roomId ? `${connectionLabel} · ${together.state.users.length || 1} 人 · ${elapsedLabel}` : '网易云双人房间' }}</small>
                    </div>
                </div>
                <div class="header-song" v-if="together.state.roomId">
                    <span>{{ together.state.applying ? '正在跟随对方' : together.supported ? '共享播放中' : '等待网易云歌曲' }}</span>
                    <strong>{{ song?.name || '暂无歌曲' }}</strong>
                </div>
                <button class="icon-button close-button" type="button" aria-label="收起一起听" title="收起" @click="together.show = false">×</button>
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
                    <div class="playlist-handoff">
                        <div>
                            <strong>当前播放列表</strong>
                            <span>{{ player.songList?.length || 0 }} 首歌曲</span>
                        </div>
                        <button class="primary" type="button" @click.stop="openPlaylist">打开播放列表</button>
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

<style scoped>
.listen-together-inline { --panel: rgba(236, 246, 247, .98); --ink: #202b2e; --muted: #68797d; --line: rgba(42, 58, 62, .16); --accent: #448a9c; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; background: var(--panel); color: var(--ink); border: 1px solid var(--line); box-shadow: 0 14px 32px rgba(28, 44, 48, .18); font: 13px SourceHanSansCN-Bold, sans-serif; z-index: 140; }
.listen-together-inline--widget { position: absolute; left: 0; right: 0; bottom: 65px; max-height: min(520px, calc(100vh - 155px)); border-radius: 6px 6px 0 0; }
.listen-together-inline--player { position: absolute; inset: 0; border-radius: 4px; box-shadow: none; z-index: 140; }
.together-header { flex: 0 0 auto; min-height: 58px; display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 1.4fr) 30px; align-items: center; gap: 14px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.header-state { display: flex; align-items: center; min-width: 0; gap: 9px; }
.header-state > div, .header-song { min-width: 0; display: grid; }
.header-state strong, .header-song strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-state small, .header-song span, .muted { color: var(--muted); font-size: 11px; }
.header-song { text-align: right; }
.status-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px rgba(68, 138, 156, .12); }
.status-dot.idle { background: #98a4a7; box-shadow: none; }
.status-dot.warning { background: #c57b31; }
.together-content { min-height: 0; overflow-y: auto; padding: 14px; }
.listen-together-inline button, .listen-together-inline input { box-sizing: border-box; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: inherit; font: inherit; }
.listen-together-inline button { min-height: 32px; padding: 6px 11px; cursor: pointer; }
.listen-together-inline button:hover:not(:disabled) { border-color: var(--accent); background: rgba(68, 138, 156, .08); }
.listen-together-inline button:disabled { opacity: .45; cursor: default; }
.listen-together-inline button:focus-visible, .listen-together-inline input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.listen-together-inline button.primary { border-color: var(--ink); background: var(--ink); color: #fff; }
.listen-together-inline button.danger { color: #9b3b29; border-color: rgba(155, 59, 41, .35); }
.icon-button { width: 30px; min-height: 30px !important; padding: 0 !important; font-family: Bender-Bold, sans-serif !important; }
.close-button { grid-column: 3; border: 0 !important; font-size: 21px !important; }
.segment-control { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; width: min(320px, 100%); margin-bottom: 14px; }
.segment-control button { border-radius: 0; margin-left: -1px; }
.segment-control button:first-child { margin-left: 0; border-radius: 4px 0 0 4px; }
.segment-control button:last-child { border-radius: 0 4px 4px 0; }
.segment-control button[aria-selected="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.empty-state { display: grid; justify-items: start; gap: 10px; color: var(--muted); }
.entry-layout { max-width: 520px; }
.join-form { display: grid; grid-template-columns: 1fr minmax(150px, .38fr); gap: 10px; }
.join-form label { display: grid; gap: 5px; color: var(--muted); font-size: 11px; }
.join-form input { width: 100%; min-height: 36px; padding: 8px 10px; }
.form-actions { grid-column: 1 / -1; display: flex; gap: 8px; }
.playlist-handoff { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 10px 0 13px; border-bottom: 1px solid var(--line); }
.playlist-handoff > div { min-width: 0; display: grid; gap: 2px; }
.playlist-handoff strong { font-size: 14px; }
.playlist-handoff span, .section-label { color: var(--muted); font-size: 11px; }
.section-label { display: block; margin-bottom: 5px; }
.members { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; list-style: none; margin: 0 0 14px; padding: 0; }
.members li { min-width: 0; display: flex; align-items: center; gap: 9px; padding: 9px; border-bottom: 1px solid var(--line); }
.members img, .avatar-fallback { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 50%; object-fit: cover; }
.avatar-fallback { display: grid; place-items: center; background: rgba(68, 138, 156, .14); color: var(--accent); }
.members li > div { min-width: 0; display: grid; }
.members strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.members small { color: var(--muted); }
.room-actions { display: flex; justify-content: space-between; gap: 8px; }
.error { margin: 12px 0 0; padding: 8px 10px; background: #fff0ec; color: #9b3b29; }
.together-inline-enter-active, .together-inline-leave-active { transition: opacity .16s ease, transform .2s cubic-bezier(.2, .8, .2, 1); }
.together-inline-enter-from, .together-inline-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 720px) {
    .together-header { grid-template-columns: 1fr 30px; }
    .header-song { display: none; }
    .close-button { grid-column: 2; }
    .join-form { grid-template-columns: 1fr; }
    .inviter-field, .form-actions { grid-column: auto; }
    .members { grid-template-columns: 1fr; }
    .playlist-handoff { align-items: flex-start; }
}
@media (prefers-color-scheme: dark) {
    .listen-together-inline { --panel: rgba(29, 42, 46, .98); --ink: #dae9ed; --muted: #a1b4ba; --line: rgba(210, 235, 240, .16); }
    .listen-together-inline button.primary, .segment-control button[aria-selected="true"] { color: #202b2e; }
    .error { background: rgba(110, 40, 29, .36); color: #f1b5a9; }
}
</style>
