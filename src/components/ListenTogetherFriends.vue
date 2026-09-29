<script setup>
import { computed, ref, watch } from 'vue'
import { getUserFollows } from '../api/user'
import { useUserStore } from '../store/userStore'
import { useListenTogetherStore } from '../store/listenTogetherStore'
const user = useUserStore()
const together = useListenTogetherStore()
const friends = ref([])
const filter = ref('')
const loading = ref(false)
const error = ref('')
const more = ref(true)
const offset = ref(0)
const inviting = ref('')
const sent = ref(new Set())
let generation = 0
const visibleFriends = computed(() => friends.value.filter(friend => friend.nickname?.toLowerCase().includes(filter.value.trim().toLowerCase())))
async function load() {
    if (loading.value || !more.value || !user.user?.userId) return
    const token = generation
    loading.value = true; error.value = ''
    try {
        const result = await getUserFollows(user.user.userId, offset.value)
        if (token !== generation) return
        if (result.code !== 200 || !Array.isArray(result.follow)) throw new Error(result.message || '关注列表加载失败，请重试')
        offset.value += result.follow.length
        const known = new Set(friends.value.map(friend => String(friend.userId)))
        friends.value.push(...result.follow.filter(friend => friend.userId && !known.has(String(friend.userId))))
        more.value = result.more === undefined ? result.follow.length === 30 : !!result.more
    } catch (cause) { if (token === generation) error.value = cause.message || '关注列表加载失败，请重试' }
    finally { if (token === generation) loading.value = false }
}
watch(() => user.user?.userId, () => {
    generation++; friends.value = []; offset.value = 0; more.value = true; loading.value = false; sent.value = new Set()
    void load()
}, { immediate: true })
async function invite(friend) {
    if (inviting.value || together.state.busy) return
    const token = generation
    inviting.value = String(friend.userId)
    try {
        if (!together.state.roomId) await together.create()
        if (token !== generation || !together.state.roomId || together.state.error) return
        together.state.invitationSent = false
        await together.invite(friend.userId)
        if (token === generation && together.state.invitationSent) sent.value = new Set([...sent.value, String(friend.userId)])
    } finally { inviting.value = '' }
}
</script>

<template>
    <div class="friend-picker">
        <p>选择你关注的人，发送网易云一起听邀请。</p>
        <input v-model="filter" aria-label="筛选关注的人" placeholder="搜索已加载的昵称" />
        <ul>
            <li v-for="friend in visibleFriends" :key="friend.userId">
                <img v-if="friend.avatarUrl" :src="friend.avatarUrl" alt="" referrerpolicy="no-referrer" />
                <span>{{ friend.nickname }}</span>
                <button type="button" :disabled="!!inviting || together.state.busy || sent.has(String(friend.userId))" @click="invite(friend)">{{ inviting === String(friend.userId) ? '邀请中…' : sent.has(String(friend.userId)) ? '已邀请' : '邀请' }}</button>
            </li>
        </ul>
        <p v-if="!loading && !error && !visibleFriends.length">{{ filter ? '暂未找到这个昵称，可继续加载关注列表。' : '暂无关注的人，可切换到加入房间。' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="more || error" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : error ? '重试' : '加载更多' }}</button>
    </div>
</template>

<style scoped>
.friend-picker p { font-size: 12px; color: var(--muted, #66767b); margin: 10px 0; }
.friend-picker input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--line, #d7e2e5); border-radius: 5px; background: transparent; color: inherit; }
.friend-picker ul { max-height: 240px; overflow-y: auto; list-style: none; padding: 0; margin: 10px 0; }
.friend-picker li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line, #d7e2e5); }
.friend-picker img { width: 34px; height: 34px; border-radius: 50%; }
.friend-picker span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.friend-picker button { border: 1px solid var(--line, #d7e2e5); border-radius: 5px; padding: 7px 14px; background: transparent; color: inherit; cursor: pointer; }
.friend-picker button:disabled { opacity: .5; cursor: default; }
.friend-picker button:focus-visible, .friend-picker input:focus-visible { outline: 2px solid #448a9c; outline-offset: 2px; }
</style>
