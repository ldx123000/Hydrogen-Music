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
        if (result.code !== 200 || !Array.isArray(result.follow)) throw new Error(result.message || result.msg || '关注列表加载失败，请重试')
        offset.value += result.follow.length
        const known = new Set(friends.value.map(friend => String(friend.userId)))
        friends.value.push(...result.follow.filter(friend => friend.userId && !known.has(String(friend.userId))))
        more.value = result.more === undefined ? result.follow.length === 30 : !!result.more
    } catch (cause) {
        if (token === generation) {
            const status = cause.response?.status
            error.value = cause.response?.data?.message || cause.response?.data?.msg
                || (status ? `关注列表加载失败（${status}），请稍后重试` : cause.message || '关注列表加载失败，请重试')
        }
    }
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
        <p class="friend-hint">选择关注的好友，邀请一起听。</p>
        <input v-model="filter" aria-label="筛选关注的人" placeholder="搜索已加载的昵称" />
        <ul>
            <li v-for="friend in visibleFriends" :key="friend.userId">
                <img v-if="friend.avatarUrl" :src="friend.avatarUrl" alt="" referrerpolicy="no-referrer" />
                <span v-else class="friend-avatar" aria-hidden="true">{{ (friend.nickname || '网').slice(0, 1) }}</span>
                <span class="friend-name" :title="friend.nickname">{{ friend.nickname }}</span>
                <button type="button" :disabled="!!inviting || together.state.busy || sent.has(String(friend.userId))" @click="invite(friend)">{{ inviting === String(friend.userId) ? '邀请中…' : sent.has(String(friend.userId)) ? '已邀请' : '邀请' }}</button>
            </li>
        </ul>
        <p v-if="!loading && !error && !visibleFriends.length">{{ filter ? '暂未找到这个昵称，可继续加载关注列表。' : '暂无关注的人，可切换到加入房间。' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="more || error" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : error ? '重试' : '加载更多' }}</button>
    </div>
</template>

<style scoped lang="scss">
.friend-picker {
    p { font-size: 12px; line-height: 1.7; color: var(--muted-text) !important; margin: 12px 0; }
    .friend-hint { margin: 0 0 12px; }
    input {
        width: 100%;
    }
    ul { max-height: 220px; overflow-y: auto; list-style: none; padding: 0; margin: 8px 0 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    li { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    img, .friend-avatar { width: 30px; height: 30px; flex: 0 0 30px; object-fit: cover; }
    .friend-avatar { display: grid; place-items: center; border: 1px solid var(--border); font-size: 12px; }
    .friend-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    > button { margin-top: 12px; }
}
</style>
