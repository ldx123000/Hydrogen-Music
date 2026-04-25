import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { getMusicCommentsNew, getMusicCommentFloor, postMusicComment, likeMusicComment } from '../api/song'
import { getDjProgramCommentsNew, getDjProgramCommentFloor, postDjProgramComment, likeDjProgramComment } from '../api/dj'
import { usePlayerStore } from '../store/playerStore'
import { useUserStore } from '../store/userStore'
import { storeToRefs } from 'pinia'
import { noticeOpen } from '../utils/dialog'
import { getCommentScrollPosition, setCommentScrollPosition, getLastCommentTargetKey, setLastCommentTargetKey } from '../utils/commentScrollMemory'
import { getIndexedSongOrFirst } from '../utils/songList'
import { formatCommentTime } from '../utils/commentFormat'

const FLOOR_REPLY_LIMIT = 5
const COMMENTS_PREFETCH_PX = 200

const getUserName = user => (user && user.nickname) || '未知用户'

const getUserAvatar = (user, size = 40) => {
    if (user && user.avatarUrl) return `${user.avatarUrl}?param=${size}y${size}`
    return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
}

const toPositiveInt = value => {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0
}

const createFloorState = replyCount => ({
    expanded: false,
    loading: false,
    error: '',
    items: [],
    hasMore: replyCount > 0,
    nextTime: -1,
    total: replyCount,
})

export function useCommentsPanel({ emit } = {}) {
    const playerStore = usePlayerStore()
    const userStore = useUserStore()
    const { songId, songList, currentIndex, listInfo } = storeToRefs(playerStore)
    const currentTrack = computed(() => {
        return getIndexedSongOrFirst(songList.value, currentIndex.value)
    })
    const isDj = computed(() => listInfo.value && listInfo.value.type === 'dj')
    const programId = computed(() => {
        const cur = currentTrack.value
        return cur && (cur.programId || cur.programID || cur.programid)
    })
    const musicCommentId = computed(() => {
        if (isDj.value) return null
        const cur = currentTrack.value
        if (cur?.source === 'siren') return null
        const curId = cur && (cur.id || cur.songId || cur.musicId)
        return curId || songId.value || null
    })

    const comments = ref([])
    const hotComments = ref([])
    const loading = ref(false)
    const total = ref(0)
    const hasMore = ref(true)
    const nextCursor = ref('0')
    const pageNo = ref(1)
    const limit = ref(20)
    const newComment = ref('')
    const replyingTo = ref(null)
    const submitting = ref(false)
    const floorReplies = ref({})
    const commentsContainerRef = ref(null)
    const scrollCheckRafId = ref(null)
    const pendingRestoreScrollTop = ref(null)

    const commentTargetKey = computed(() => {
        if (isDj.value) {
            return programId.value ? `dj:${programId.value}` : ''
        }
        return musicCommentId.value ? `song:${musicCommentId.value}` : ''
    })

    const resetCommentsScroll = () => {
        const container = commentsContainerRef.value
        if (!container) return
        container.scrollTop = 0
    }

    const getDistanceToBottom = () => {
        const container = commentsContainerRef.value
        if (!container) return Number.POSITIVE_INFINITY
        return container.scrollHeight - (container.scrollTop + container.clientHeight)
    }

    const cacheCurrentScrollPosition = (targetKey = commentTargetKey.value) => {
        const container = commentsContainerRef.value
        if (!container || !targetKey) return
        setCommentScrollPosition(targetKey, container.scrollTop)
    }

    const restoreCommentsScrollIfNeeded = () => {
        if (pendingRestoreScrollTop.value === null) return

        const container = commentsContainerRef.value
        if (!container) return

        const expectedScrollTop = pendingRestoreScrollTop.value
        container.scrollTop = expectedScrollTop

        // 如果当前位置已恢复到目标（或已没有更多可加载），结束恢复流程。
        const restored = Math.abs(container.scrollTop - expectedScrollTop) <= 2
        if (restored || !hasMore.value) {
            pendingRestoreScrollTop.value = null
        }

        cacheCurrentScrollPosition()
    }

    const shouldAutoLoadMore = () => {
        if (loading.value || !hasMore.value) return false
        return getDistanceToBottom() <= COMMENTS_PREFETCH_PX
    }

    const tryAutoLoadMore = () => {
        if (!shouldAutoLoadMore()) return
        fetchComments(false)
    }

    const handleCommentsScroll = () => {
        cacheCurrentScrollPosition()
        if (scrollCheckRafId.value !== null) return
        scrollCheckRafId.value = requestAnimationFrame(() => {
            scrollCheckRafId.value = null
            tryAutoLoadMore()
        })
    }

    const clearScrollCheckRaf = () => {
        if (scrollCheckRafId.value === null) return
        cancelAnimationFrame(scrollCheckRafId.value)
        scrollCheckRafId.value = null
    }

    const resolveReplyRootCommentId = (comment, rootCommentId = null) => {
        const explicitRoot = Number(rootCommentId)
        if (Number.isFinite(explicitRoot) && explicitRoot > 0) return explicitRoot

        const parentId = Number(comment && comment.parentCommentId)
        if (Number.isFinite(parentId) && parentId > 0) return parentId

        const selfId = Number(comment && comment.commentId)
        if (Number.isFinite(selfId) && selfId > 0) return selfId

        return null
    }

    const isInlineReplyVisible = comment => {
        if (!replyingTo.value || !comment || !comment.commentId) return false
        const expectedRootId = resolveReplyRootCommentId(replyingTo.value, replyingTo.value.__rootCommentId)
        return expectedRootId === comment.commentId
    }

    const getCommentReplyCount = comment => {
        return toPositiveInt(comment && comment.showFloorComment && comment.showFloorComment.replyCount)
    }

    const getFloorCommentKey = comment => {
        if (!comment || !comment.commentId) return ''
        return String(comment.commentId)
    }

    const getFloorState = comment => {
        const key = getFloorCommentKey(comment)
        if (!key) return null
        return floorReplies.value[key] || null
    }

    const ensureFloorState = comment => {
        const key = getFloorCommentKey(comment)
        if (!key) return null
        if (!floorReplies.value[key]) {
            floorReplies.value[key] = createFloorState(getCommentReplyCount(comment))
        }
        return floorReplies.value[key]
    }

    const rebuildFloorStates = (preserveExisting = true) => {
        const previous = preserveExisting ? floorReplies.value || {} : {}
        const next = {}
        const mergedComments = [...hotComments.value, ...comments.value]

        for (const comment of mergedComments) {
            const key = getFloorCommentKey(comment)
            if (!key) continue

            const replyCount = getCommentReplyCount(comment)
            const previousState = previous[key]

            if (previousState) {
                const nextState = {
                    ...previousState,
                    total: replyCount > 0 ? replyCount : previousState.total || 0,
                }
                if (nextState.total > 0 && nextState.items.length >= nextState.total) {
                    nextState.hasMore = false
                }
                next[key] = nextState
            } else {
                next[key] = createFloorState(replyCount)
            }
        }

        floorReplies.value = next
    }

    const mergeFloorItems = (existing = [], incoming = []) => {
        if (!existing.length) return incoming.slice()
        if (!incoming.length) return existing.slice()

        const seen = new Set(existing.map(item => item.commentId))
        const merged = existing.slice()
        for (const item of incoming) {
            if (seen.has(item.commentId)) continue
            merged.push(item)
            seen.add(item.commentId)
        }
        return merged
    }

    const requestCommentList = async params => {
        if (isDj.value && programId.value) {
            return getDjProgramCommentsNew({ id: programId.value, ...params })
        }
        if (musicCommentId.value) {
            return getMusicCommentsNew({ id: musicCommentId.value, ...params })
        }
        return null
    }

    const requestCommentFloor = async params => {
        if (isDj.value && programId.value) {
            return getDjProgramCommentFloor({ id: programId.value, ...params })
        }
        if (musicCommentId.value) {
            return getMusicCommentFloor({ id: musicCommentId.value, ...params })
        }
        return null
    }

    const loadFloorReplies = async (comment, { forceFirstPage = false } = {}) => {
        const state = ensureFloorState(comment)
        if (!state || state.loading) return

        const replyCount = getCommentReplyCount(comment)
        if (!replyCount && state.items.length === 0) {
            state.hasMore = false
            state.total = 0
            state.expanded = true
            return
        }

        const isFirstPage = forceFirstPage || state.items.length === 0
        if (!isFirstPage && !state.hasMore) return

        state.loading = true
        state.error = ''

        try {
            const response = await requestCommentFloor({
                parentCommentId: comment.commentId,
                limit: FLOOR_REPLY_LIMIT,
                time: isFirstPage ? -1 : state.nextTime,
            })

            if (response && response.code === 200) {
                const data = response.data || {}
                const incomingItems = Array.isArray(data.comments) ? data.comments : []

                if (isFirstPage) {
                    state.items = incomingItems
                } else {
                    state.items = mergeFloorItems(state.items, incomingItems)
                }

                const totalCount = Number(data.totalCount)
                if (Number.isFinite(totalCount) && totalCount >= 0) {
                    state.total = Math.floor(totalCount)
                }

                state.hasMore = !!data.hasMore

                const nextTimeValue = Number(data.time)
                if (Number.isFinite(nextTimeValue) && nextTimeValue >= 0) {
                    state.nextTime = nextTimeValue
                }

                if (state.total > 0 && state.items.length >= state.total) {
                    state.hasMore = false
                }

                state.expanded = true
            } else {
                state.error = '回复加载失败，点击重试'
            }
        } catch (error) {
            console.error('获取楼层回复失败:', error)
            state.error = '回复加载失败，点击重试'
        } finally {
            state.loading = false
        }
    }

    const toggleFloorReplies = async comment => {
        const state = ensureFloorState(comment)
        if (!state) return

        if (state.expanded) {
            state.expanded = false
            return
        }

        if (state.items.length > 0) {
            state.expanded = true
            return
        }

        await loadFloorReplies(comment, { forceFirstPage: true })
    }

    const loadMoreFloorReplies = async comment => {
        const state = ensureFloorState(comment)
        if (!state || state.loading || !state.hasMore) return
        await loadFloorReplies(comment)
    }

    const retryFloorReplies = async comment => {
        const state = ensureFloorState(comment)
        if (!state) return
        state.error = ''
        await loadFloorReplies(comment, { forceFirstPage: state.items.length === 0 })
    }

    // 获取评论数据
    const fetchComments = async (reset = false) => {
        if (loading.value || (!hasMore.value && !reset)) return

        const requestTargetKey = commentTargetKey.value
        if (!requestTargetKey) return

        loading.value = true
        let fetchSucceeded = false

        try {
            if (reset) {
                const [latestResult, hotResult] = await Promise.allSettled([
                    requestCommentList({
                        sortType: 3,
                        pageSize: limit.value,
                        pageNo: 1,
                        cursor: '0',
                    }),
                    requestCommentList({
                        sortType: 2,
                        pageSize: limit.value,
                        pageNo: 1,
                    }),
                ])

                const latestResponse = latestResult.status === 'fulfilled' ? latestResult.value : null
                const hotResponse = hotResult.status === 'fulfilled' ? hotResult.value : null

                if (latestResponse && latestResponse.code === 200) {
                    comments.value = latestResponse.comments || []
                    total.value = toPositiveInt(latestResponse.total)
                    hasMore.value = !!latestResponse.hasMore
                    nextCursor.value = latestResponse.cursor || ''
                    pageNo.value = 2
                    fetchSucceeded = true
                } else {
                    comments.value = []
                    total.value = 0
                    hasMore.value = false
                    nextCursor.value = ''
                    pageNo.value = 1
                }

                if (hotResponse && hotResponse.code === 200) {
                    hotComments.value = hotResponse.comments || []
                    fetchSucceeded = true
                } else {
                    hotComments.value = []
                }
            } else {
                const latestResponse = await requestCommentList({
                    sortType: 3,
                    pageSize: limit.value,
                    pageNo: pageNo.value,
                    ...(nextCursor.value ? { cursor: nextCursor.value } : {}),
                })

                if (latestResponse && latestResponse.code === 200) {
                    const incoming = latestResponse.comments || []
                    comments.value.push(...incoming)
                    total.value = toPositiveInt(latestResponse.total)
                    hasMore.value = !!latestResponse.hasMore && incoming.length > 0
                    nextCursor.value = latestResponse.cursor || nextCursor.value
                    pageNo.value += 1
                    fetchSucceeded = true
                }
            }

            rebuildFloorStates(!reset)

            if (fetchSucceeded) {
                if (requestTargetKey && typeof emit === 'function') {
                    emit('total-change', {
                        targetKey: requestTargetKey,
                        total: total.value,
                    })
                }
            } else {
                noticeOpen('获取评论失败', 2)
            }
        } catch (error) {
            console.error('获取评论失败:', error)
            noticeOpen('获取评论失败', 2)
        } finally {
            loading.value = false
        }

        if (fetchSucceeded) {
            await nextTick()
            restoreCommentsScrollIfNeeded()
            tryAutoLoadMore()
        }
    }

    // 发送评论
    const submitComment = async () => {
        if (!newComment.value.trim() || submitting.value) return

        if (!userStore.user) {
            noticeOpen('请先登录', 2)
            return
        }

        submitting.value = true

        try {
            let response = null
            if (isDj.value && programId.value) {
                response = await postDjProgramComment(programId.value, newComment.value.trim(), replyingTo.value ? replyingTo.value.commentId : null)
            } else {
                const params = {
                    id: musicCommentId.value,
                    content: newComment.value.trim(),
                }
                if (replyingTo.value) params.commentId = replyingTo.value.commentId
                response = await postMusicComment(params)
            }

            if (response && response.code === 200) {
                noticeOpen('评论发送成功', 2)
                newComment.value = ''
                replyingTo.value = null
                // 重新获取评论
                await fetchComments(true)
            } else {
                noticeOpen('评论发送失败', 2)
            }
        } catch (error) {
            console.error('发送评论失败:', error)
            noticeOpen('评论发送失败', 2)
        } finally {
            submitting.value = false
        }
    }

    // 点赞评论
    const toggleLikeComment = async comment => {
        if (!userStore.user) {
            noticeOpen('请先登录', 2)
            return
        }

        try {
            let response = null
            if (isDj.value && programId.value) {
                response = await likeDjProgramComment(programId.value, comment.commentId, !comment.liked)
            } else {
                response = await likeMusicComment({ id: musicCommentId.value, cid: comment.commentId, t: comment.liked ? 0 : 1 })
            }

            if (response && response.code === 200) {
                comment.liked = !comment.liked
                const currentCount = Number(comment.likedCount) || 0
                const nextCount = currentCount + (comment.liked ? 1 : -1)
                comment.likedCount = nextCount > 0 ? nextCount : 0
            }
        } catch (error) {
            console.error('点赞失败:', error)
            noticeOpen('操作失败', 2)
        }
    }

    // 回复评论
    const toggleReply = (comment, rootCommentId = null) => {
        const rootId = resolveReplyRootCommentId(comment, rootCommentId)
        if (!rootId) return

        if (replyingTo.value && replyingTo.value.commentId === comment.commentId && resolveReplyRootCommentId(replyingTo.value, replyingTo.value.__rootCommentId) === rootId) {
            // 如果点击的是当前正在回复的评论，则取消回复
            cancelReply()
        } else {
            // 否则开始回复这个评论
            replyingTo.value = {
                ...comment,
                __rootCommentId: rootId,
            }
            newComment.value = `@${getUserName(comment.user)} `
            // 使用nextTick确保DOM更新后再聚焦
            nextTick(() => {
                // 聚焦到回复输入框
                const textarea = document.querySelector('.reply-textarea')
                if (textarea) {
                    textarea.focus()
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
                }
            })
        }
    }

    // 取消回复
    const cancelReply = () => {
        replyingTo.value = null
        newComment.value = ''
    }

    // 处理复制成功
    const handleCopySuccess = () => {
        noticeOpen('评论已复制到剪贴板', 1)
    }

    // 处理复制失败
    const handleCopyError = error => {
        noticeOpen('复制失败，请手动选择文字复制', 2)
        console.warn('复制评论失败:', error)
    }

    const formatTime = formatCommentTime

    // 监听歌曲/节目变化，切换时重置滚动到顶部
    watch(
        commentTargetKey,
        (target, previousTarget) => {
            if (!target) {
                comments.value = []
                hotComments.value = []
                floorReplies.value = {}
                total.value = 0
                hasMore.value = false
                nextCursor.value = '0'
                pageNo.value = 1
                return
            }

            const lastCommentTarget = getLastCommentTargetKey()
            const switchedWhileCommentsClosed = !previousTarget && !!lastCommentTarget && lastCommentTarget !== target

            if (previousTarget) {
                cacheCurrentScrollPosition(previousTarget)
            }

            if (previousTarget || switchedWhileCommentsClosed) {
                pendingRestoreScrollTop.value = null
                resetCommentsScroll()
            } else {
                const cachedScrollTop = getCommentScrollPosition(target)
                pendingRestoreScrollTop.value = typeof cachedScrollTop === 'number' && cachedScrollTop > 0 ? cachedScrollTop : null
                if (pendingRestoreScrollTop.value === null) {
                    resetCommentsScroll()
                }
            }

            setLastCommentTargetKey(target)
            fetchComments(true)
        },
        { immediate: true }
    )

    onMounted(() => {
        nextTick(() => {
            tryAutoLoadMore()
        })
    })

    onUnmounted(() => {
        cacheCurrentScrollPosition()
        setLastCommentTargetKey(commentTargetKey.value)
        clearScrollCheckRaf()
    })

    return {
        userStore,
        comments,
        hotComments,
        loading,
        total,
        hasMore,
        newComment,
        replyingTo,
        submitting,
        commentsContainerRef,
        handleCommentsScroll,
        getUserName,
        getUserAvatar,
        isInlineReplyVisible,
        getCommentReplyCount,
        getFloorState,
        toggleFloorReplies,
        loadMoreFloorReplies,
        retryFloorReplies,
        submitComment,
        toggleLikeComment,
        toggleReply,
        cancelReply,
        handleCopySuccess,
        handleCopyError,
        formatTime,
    }
}
