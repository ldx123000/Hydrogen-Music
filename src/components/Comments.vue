<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getMusicCommentsNew, getMusicCommentFloor, postMusicComment, likeMusicComment } from '../api/song';
import { getDjProgramCommentsNew, getDjProgramCommentFloor, postDjProgramComment, likeDjProgramComment } from '../api/dj';
import { usePlayerStore } from '../store/playerStore';
import { useUserStore } from '../store/userStore';
import { storeToRefs } from 'pinia';
import { noticeOpen } from '../utils/dialog';
import { getCommentScrollPosition, setCommentScrollPosition, getLastCommentTargetKey, setLastCommentTargetKey } from '../utils/commentScrollMemory';
import CommentText from './CommentText.vue';

const emit = defineEmits(['total-change']);

const playerStore = usePlayerStore();
const userStore = useUserStore();
const { songId, songList, currentIndex, listInfo } = storeToRefs(playerStore);
const currentTrack = computed(() => {
    const list = songList.value || [];
    const idx = typeof currentIndex.value === 'number' ? currentIndex.value : 0;
    return list[idx] || null;
});
const isDj = computed(() => listInfo.value && listInfo.value.type === 'dj');
const programId = computed(() => {
    const cur = currentTrack.value;
    return cur && (cur.programId || cur.programID || cur.programid);
});
const musicCommentId = computed(() => {
    if (isDj.value) return null;
    const cur = currentTrack.value;
    const curId = cur && (cur.id || cur.songId || cur.musicId);
    return curId || songId.value || null;
});

const comments = ref([]);
const hotComments = ref([]);
const loading = ref(false);
const total = ref(0);
const hasMore = ref(true);
const nextCursor = ref('0');
const pageNo = ref(1);
const limit = ref(20);
const newComment = ref('');
const replyingTo = ref(null);
const submitting = ref(false);
const floorReplies = ref({});

const FLOOR_REPLY_LIMIT = 5;

const COMMENTS_PREFETCH_PX = 200;
const commentsContainerRef = ref(null);
const scrollCheckRafId = ref(null);
const commentTargetKey = computed(() => {
    if (isDj.value) {
        return programId.value ? `dj:${programId.value}` : '';
    }
    return musicCommentId.value ? `song:${musicCommentId.value}` : '';
});
const pendingRestoreScrollTop = ref(null);

const resetCommentsScroll = () => {
    const container = commentsContainerRef.value;
    if (!container) return;
    container.scrollTop = 0;
};

const getDistanceToBottom = () => {
    const container = commentsContainerRef.value;
    if (!container) return Number.POSITIVE_INFINITY;
    return container.scrollHeight - (container.scrollTop + container.clientHeight);
};

const cacheCurrentScrollPosition = (targetKey = commentTargetKey.value) => {
    const container = commentsContainerRef.value;
    if (!container || !targetKey) return;
    setCommentScrollPosition(targetKey, container.scrollTop);
};

const restoreCommentsScrollIfNeeded = () => {
    if (pendingRestoreScrollTop.value === null) return;

    const container = commentsContainerRef.value;
    if (!container) return;

    const expectedScrollTop = pendingRestoreScrollTop.value;
    container.scrollTop = expectedScrollTop;

    // 如果当前位置已恢复到目标（或已没有更多可加载），结束恢复流程。
    const restored = Math.abs(container.scrollTop - expectedScrollTop) <= 2;
    if (restored || !hasMore.value) {
        pendingRestoreScrollTop.value = null;
    }

    cacheCurrentScrollPosition();
};

const shouldAutoLoadMore = () => {
    if (loading.value || !hasMore.value) return false;
    return getDistanceToBottom() <= COMMENTS_PREFETCH_PX;
};

const tryAutoLoadMore = () => {
    if (!shouldAutoLoadMore()) return;
    fetchComments(false);
};

const handleCommentsScroll = () => {
    cacheCurrentScrollPosition();
    if (scrollCheckRafId.value !== null) return;
    scrollCheckRafId.value = requestAnimationFrame(() => {
        scrollCheckRafId.value = null;
        tryAutoLoadMore();
    });
};

const clearScrollCheckRaf = () => {
    if (scrollCheckRafId.value === null) return;
    cancelAnimationFrame(scrollCheckRafId.value);
    scrollCheckRafId.value = null;
};

const getUserName = user => (user && user.nickname) || '未知用户';

const getUserAvatar = (user, size = 40) => {
    if (user && user.avatarUrl) return `${user.avatarUrl}?param=${size}y${size}`;
    return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
};

const resolveReplyRootCommentId = (comment, rootCommentId = null) => {
    const explicitRoot = Number(rootCommentId);
    if (Number.isFinite(explicitRoot) && explicitRoot > 0) return explicitRoot;

    const parentId = Number(comment && comment.parentCommentId);
    if (Number.isFinite(parentId) && parentId > 0) return parentId;

    const selfId = Number(comment && comment.commentId);
    if (Number.isFinite(selfId) && selfId > 0) return selfId;

    return null;
};

const isInlineReplyVisible = comment => {
    if (!replyingTo.value || !comment || !comment.commentId) return false;
    const expectedRootId = resolveReplyRootCommentId(replyingTo.value, replyingTo.value.__rootCommentId);
    return expectedRootId === comment.commentId;
};

const toPositiveInt = value => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};

const getCommentReplyCount = comment => {
    return toPositiveInt(comment && comment.showFloorComment && comment.showFloorComment.replyCount);
};

const createFloorState = replyCount => ({
    expanded: false,
    loading: false,
    error: '',
    items: [],
    hasMore: replyCount > 0,
    nextTime: -1,
    total: replyCount,
});

const getFloorCommentKey = comment => {
    if (!comment || !comment.commentId) return '';
    return String(comment.commentId);
};

const getFloorState = comment => {
    const key = getFloorCommentKey(comment);
    if (!key) return null;
    return floorReplies.value[key] || null;
};

const ensureFloorState = comment => {
    const key = getFloorCommentKey(comment);
    if (!key) return null;
    if (!floorReplies.value[key]) {
        floorReplies.value[key] = createFloorState(getCommentReplyCount(comment));
    }
    return floorReplies.value[key];
};

const rebuildFloorStates = (preserveExisting = true) => {
    const previous = preserveExisting ? floorReplies.value || {} : {};
    const next = {};
    const mergedComments = [...hotComments.value, ...comments.value];

    for (const comment of mergedComments) {
        const key = getFloorCommentKey(comment);
        if (!key) continue;

        const replyCount = getCommentReplyCount(comment);
        const previousState = previous[key];

        if (previousState) {
            const nextState = {
                ...previousState,
                total: replyCount > 0 ? replyCount : previousState.total || 0,
            };
            if (nextState.total > 0 && nextState.items.length >= nextState.total) {
                nextState.hasMore = false;
            }
            next[key] = nextState;
        } else {
            next[key] = createFloorState(replyCount);
        }
    }

    floorReplies.value = next;
};

const mergeFloorItems = (existing = [], incoming = []) => {
    if (!existing.length) return incoming.slice();
    if (!incoming.length) return existing.slice();

    const seen = new Set(existing.map(item => item.commentId));
    const merged = existing.slice();
    for (const item of incoming) {
        if (seen.has(item.commentId)) continue;
        merged.push(item);
        seen.add(item.commentId);
    }
    return merged;
};

const requestCommentList = async params => {
    if (isDj.value && programId.value) {
        return getDjProgramCommentsNew({ id: programId.value, ...params });
    }
    if (musicCommentId.value) {
        return getMusicCommentsNew({ id: musicCommentId.value, ...params });
    }
    return null;
};

const requestCommentFloor = async params => {
    if (isDj.value && programId.value) {
        return getDjProgramCommentFloor({ id: programId.value, ...params });
    }
    if (musicCommentId.value) {
        return getMusicCommentFloor({ id: musicCommentId.value, ...params });
    }
    return null;
};

const loadFloorReplies = async (comment, { forceFirstPage = false } = {}) => {
    const state = ensureFloorState(comment);
    if (!state || state.loading) return;

    const replyCount = getCommentReplyCount(comment);
    if (!replyCount && state.items.length === 0) {
        state.hasMore = false;
        state.total = 0;
        state.expanded = true;
        return;
    }

    const isFirstPage = forceFirstPage || state.items.length === 0;
    if (!isFirstPage && !state.hasMore) return;

    state.loading = true;
    state.error = '';

    try {
        const response = await requestCommentFloor({
            parentCommentId: comment.commentId,
            limit: FLOOR_REPLY_LIMIT,
            time: isFirstPage ? -1 : state.nextTime,
        });

        if (response && response.code === 200) {
            const data = response.data || {};
            const incomingItems = Array.isArray(data.comments) ? data.comments : [];

            if (isFirstPage) {
                state.items = incomingItems;
            } else {
                state.items = mergeFloorItems(state.items, incomingItems);
            }

            const totalCount = Number(data.totalCount);
            if (Number.isFinite(totalCount) && totalCount >= 0) {
                state.total = Math.floor(totalCount);
            }

            state.hasMore = !!data.hasMore;

            const nextTimeValue = Number(data.time);
            if (Number.isFinite(nextTimeValue) && nextTimeValue >= 0) {
                state.nextTime = nextTimeValue;
            }

            if (state.total > 0 && state.items.length >= state.total) {
                state.hasMore = false;
            }

            state.expanded = true;
        } else {
            state.error = '回复加载失败，点击重试';
        }
    } catch (error) {
        console.error('获取楼层回复失败:', error);
        state.error = '回复加载失败，点击重试';
    } finally {
        state.loading = false;
    }
};

const toggleFloorReplies = async comment => {
    const state = ensureFloorState(comment);
    if (!state) return;

    if (state.expanded) {
        state.expanded = false;
        return;
    }

    if (state.items.length > 0) {
        state.expanded = true;
        return;
    }

    await loadFloorReplies(comment, { forceFirstPage: true });
};

const loadMoreFloorReplies = async comment => {
    const state = ensureFloorState(comment);
    if (!state || state.loading || !state.hasMore) return;
    await loadFloorReplies(comment);
};

const retryFloorReplies = async comment => {
    const state = ensureFloorState(comment);
    if (!state) return;
    state.error = '';
    await loadFloorReplies(comment, { forceFirstPage: state.items.length === 0 });
};

// 获取评论数据
const fetchComments = async (reset = false) => {
    if (loading.value || (!hasMore.value && !reset)) return;

    const requestTargetKey = commentTargetKey.value;
    if (!requestTargetKey) return;

    loading.value = true;
    let fetchSucceeded = false;

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
            ]);

            const latestResponse = latestResult.status === 'fulfilled' ? latestResult.value : null;
            const hotResponse = hotResult.status === 'fulfilled' ? hotResult.value : null;

            if (latestResponse && latestResponse.code === 200) {
                comments.value = latestResponse.comments || [];
                total.value = toPositiveInt(latestResponse.total);
                hasMore.value = !!latestResponse.hasMore;
                nextCursor.value = latestResponse.cursor || '';
                pageNo.value = 2;
                fetchSucceeded = true;
            } else {
                comments.value = [];
                total.value = 0;
                hasMore.value = false;
                nextCursor.value = '';
                pageNo.value = 1;
            }

            if (hotResponse && hotResponse.code === 200) {
                hotComments.value = hotResponse.comments || [];
                fetchSucceeded = true;
            } else {
                hotComments.value = [];
            }
        } else {
            const latestResponse = await requestCommentList({
                sortType: 3,
                pageSize: limit.value,
                pageNo: pageNo.value,
                ...(nextCursor.value ? { cursor: nextCursor.value } : {}),
            });

            if (latestResponse && latestResponse.code === 200) {
                const incoming = latestResponse.comments || [];
                comments.value.push(...incoming);
                total.value = toPositiveInt(latestResponse.total);
                hasMore.value = !!latestResponse.hasMore && incoming.length > 0;
                nextCursor.value = latestResponse.cursor || nextCursor.value;
                pageNo.value += 1;
                fetchSucceeded = true;
            }
        }

        rebuildFloorStates(!reset);

        if (fetchSucceeded) {
            if (requestTargetKey) {
                emit('total-change', {
                    targetKey: requestTargetKey,
                    total: total.value,
                });
            }
        } else {
            noticeOpen('获取评论失败', 2);
        }
    } catch (error) {
        console.error('获取评论失败:', error);
        noticeOpen('获取评论失败', 2);
    } finally {
        loading.value = false;
    }

    if (fetchSucceeded) {
        await nextTick();
        restoreCommentsScrollIfNeeded();
        tryAutoLoadMore();
    }
};

// 发送评论
const submitComment = async () => {
    if (!newComment.value.trim() || submitting.value) return;

    if (!userStore.user) {
        noticeOpen('请先登录', 2);
        return;
    }

    submitting.value = true;

    try {
        let response = null;
        if (isDj.value && programId.value) {
            response = await postDjProgramComment(programId.value, newComment.value.trim(), replyingTo.value ? replyingTo.value.commentId : null);
        } else {
            const params = {
                id: musicCommentId.value,
                content: newComment.value.trim(),
            };
            if (replyingTo.value) params.commentId = replyingTo.value.commentId;
            response = await postMusicComment(params);
        }

        if (response && response.code === 200) {
            noticeOpen('评论发送成功', 2);
            newComment.value = '';
            replyingTo.value = null;
            // 重新获取评论
            await fetchComments(true);
        } else {
            noticeOpen('评论发送失败', 2);
        }
    } catch (error) {
        console.error('发送评论失败:', error);
        noticeOpen('评论发送失败', 2);
    } finally {
        submitting.value = false;
    }
};

// 点赞评论
const toggleLikeComment = async comment => {
    if (!userStore.user) {
        noticeOpen('请先登录', 2);
        return;
    }

    try {
        let response = null;
        if (isDj.value && programId.value) {
            response = await likeDjProgramComment(programId.value, comment.commentId, !comment.liked);
        } else {
            response = await likeMusicComment({ id: musicCommentId.value, cid: comment.commentId, t: comment.liked ? 0 : 1 });
        }

        if (response && response.code === 200) {
            comment.liked = !comment.liked;
            const currentCount = Number(comment.likedCount) || 0;
            const nextCount = currentCount + (comment.liked ? 1 : -1);
            comment.likedCount = nextCount > 0 ? nextCount : 0;
        }
    } catch (error) {
        console.error('点赞失败:', error);
        noticeOpen('操作失败', 2);
    }
};

// 回复评论
const toggleReply = (comment, rootCommentId = null) => {
    const rootId = resolveReplyRootCommentId(comment, rootCommentId);
    if (!rootId) return;

    if (replyingTo.value && replyingTo.value.commentId === comment.commentId && resolveReplyRootCommentId(replyingTo.value, replyingTo.value.__rootCommentId) === rootId) {
        // 如果点击的是当前正在回复的评论，则取消回复
        cancelReply();
    } else {
        // 否则开始回复这个评论
        replyingTo.value = {
            ...comment,
            __rootCommentId: rootId,
        };
        newComment.value = `@${getUserName(comment.user)} `;
        // 使用nextTick确保DOM更新后再聚焦
        nextTick(() => {
            // 聚焦到回复输入框
            const textarea = document.querySelector('.reply-textarea');
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
        });
    }
};

// 取消回复
const cancelReply = () => {
    replyingTo.value = null;
    newComment.value = '';
};

// 处理复制成功
const handleCopySuccess = () => {
    noticeOpen('评论已复制到剪贴板', 1);
};

// 处理复制失败
const handleCopyError = error => {
    noticeOpen('复制失败，请手动选择文字复制', 2);
    console.warn('复制评论失败:', error);
};

// 格式化时间
const formatTime = timestamp => {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return '刚刚';

    const now = Date.now();
    const diff = now - ts;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) {
        return '刚刚';
    } else if (diff < hour) {
        return `${Math.floor(diff / minute)}分钟前`;
    } else if (diff < day) {
        return `${Math.floor(diff / hour)}小时前`;
    } else if (diff < month) {
        return `${Math.floor(diff / day)}天前`;
    } else if (diff < year) {
        return `${Math.floor(diff / month)}个月前`;
    } else {
        return `${Math.floor(diff / year)}年前`;
    }
};

// 监听歌曲/节目变化，切换时重置滚动到顶部
watch(
    commentTargetKey,
    (target, previousTarget) => {
        if (!target) {
            comments.value = [];
            hotComments.value = [];
            floorReplies.value = {};
            total.value = 0;
            hasMore.value = false;
            nextCursor.value = '0';
            pageNo.value = 1;
            return;
        }

        const lastCommentTarget = getLastCommentTargetKey();
        const switchedWhileCommentsClosed = !previousTarget && !!lastCommentTarget && lastCommentTarget !== target;

        if (previousTarget) {
            cacheCurrentScrollPosition(previousTarget);
        }

        if (previousTarget || switchedWhileCommentsClosed) {
            pendingRestoreScrollTop.value = null;
            resetCommentsScroll();
        } else {
            const cachedScrollTop = getCommentScrollPosition(target);
            pendingRestoreScrollTop.value = typeof cachedScrollTop === 'number' && cachedScrollTop > 0 ? cachedScrollTop : null;
            if (pendingRestoreScrollTop.value === null) {
                resetCommentsScroll();
            }
        }

        setLastCommentTargetKey(target);
        fetchComments(true);
    },
    { immediate: true }
);

onMounted(() => {
    nextTick(() => {
        tryAutoLoadMore();
    });
});

onUnmounted(() => {
    cacheCurrentScrollPosition();
    setLastCommentTargetKey(commentTargetKey.value);
    clearScrollCheckRaf();
});
</script>

<template>
    <div class="arknights-comments" ref="commentsContainerRef" @scroll.passive="handleCommentsScroll">
        <!-- 评论区主标题 -->
        <div class="comments-header">
            <div class="header-frame">
                <div class="frame-corner frame-tl"></div>
                <div class="frame-corner frame-tr"></div>
                <div class="frame-corner frame-bl"></div>
                <div class="frame-corner frame-br"></div>
                <div class="header-title-wrapper">
                    <span class="header-title">COMMENTS</span>
                    <div class="title-underline"></div>
                </div>
            </div>
        </div>

        <!-- 发表评论区域 -->
        <div class="comment-input-section" v-if="userStore.user && !replyingTo">
            <div class="input-frame">
                <div class="frame-corner frame-tl"></div>
                <div class="frame-corner frame-tr"></div>
                <div class="frame-corner frame-bl"></div>
                <div class="frame-corner frame-br"></div>

                <div class="input-content">
                    <div class="input-wrapper">
                        <textarea v-model="newComment" class="comment-textarea" placeholder="INPUT YOUR COMMENT..." :disabled="submitting" @keydown.enter.ctrl="submitComment"></textarea>
                        <div class="input-border"></div>
                    </div>

                    <div class="input-actions">
                        <span class="shortcut-hint">CTRL+ENTER</span>
                        <button class="submit-button" @click="submitComment" :disabled="!newComment.trim() || submitting">
                            <span>{{ submitting ? 'SENDING...' : 'SEND' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 未登录提示 -->
        <div class="login-prompt" v-else-if="!userStore.user">
            <div class="prompt-frame">
                <div class="frame-corner frame-tl"></div>
                <div class="frame-corner frame-tr"></div>
                <div class="frame-corner frame-bl"></div>
                <div class="frame-corner frame-br"></div>
                <span class="prompt-text">LOGIN REQUIRED TO COMMENT</span>
            </div>
        </div>

        <!-- 精彩评论区域 -->
        <div class="hot-comments-section" v-if="hotComments.length > 0">
            <div class="section-header">
                <div class="section-title-wrapper">
                    <span class="section-title">HOT COMMENTS</span>
                    <span class="section-count">[{{ hotComments.length }}]</span>
                </div>
                <div class="section-line"></div>
            </div>

            <div class="comments-grid">
                <div class="comment-card hot-card" v-for="comment in hotComments" :key="comment.commentId">
                    <div class="card-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>

                    <div class="card-content">
                        <div class="comment-meta">
                            <div class="user-avatar">
                                <img :src="getUserAvatar(comment.user, 40)" :alt="getUserName(comment.user)" />
                                <div class="avatar-frame"></div>
                            </div>
                            <div class="user-info">
                                <span class="username">{{ getUserName(comment.user) }}</span>
                                <span class="timestamp">{{ formatTime(comment.time) }}</span>
                            </div>
                        </div>

                        <CommentText :text="comment.content" :enable-emoji="true" :copyable="true" :show-copy-button="false" @copy-success="handleCopySuccess" @copy-error="handleCopyError" />

                        <div class="comment-controls">
                            <div class="control-item like-control" :class="{ active: comment.liked }" @click="toggleLikeComment(comment)">
                                <div class="control-icon">
                                    <svg viewBox="0 0 1024 1024" width="14" height="14">
                                        <path
                                            d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                        />
                                    </svg>
                                </div>
                                <span class="control-text">{{ comment.likedCount > 0 ? comment.likedCount : 'LIKE' }}</span>
                            </div>

                            <div class="control-item reply-control" @click="toggleReply(comment)">
                                <div class="control-icon">
                                    <svg viewBox="0 0 1024 1024" width="14" height="14">
                                        <path
                                            d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                        />
                                    </svg>
                                </div>
                                <span class="control-text">REPLY</span>
                            </div>
                        </div>

                        <div class="floor-replies" v-if="getCommentReplyCount(comment) > 0">
                            <button class="floor-toggle" type="button" @click="toggleFloorReplies(comment)">
                                <span v-if="!getFloorState(comment)?.expanded">展开{{ getCommentReplyCount(comment) }}条回复</span>
                                <span v-else>收起回复</span>
                            </button>

                            <div class="floor-panel" v-if="getFloorState(comment)?.expanded">
                                <div class="floor-list" v-if="(getFloorState(comment)?.items || []).length > 0">
                                    <div class="floor-item" v-for="reply in getFloorState(comment).items" :key="`floor-${comment.commentId}-${reply.commentId}`">
                                        <div class="floor-avatar">
                                            <img :src="getUserAvatar(reply.user, 24)" :alt="getUserName(reply.user)" />
                                        </div>
                                        <div class="floor-main">
                                            <div class="floor-item-meta">
                                                <span class="floor-username">{{ getUserName(reply.user) }}</span>
                                                <span class="floor-time">{{ formatTime(reply.time) }}</span>
                                            </div>
                                            <CommentText
                                                class="floor-text"
                                                :text="reply.content || ''"
                                                :enable-emoji="true"
                                                :copyable="true"
                                                :show-copy-button="false"
                                                @copy-success="handleCopySuccess"
                                                @copy-error="handleCopyError"
                                            />
                                            <div class="floor-controls">
                                                <div class="floor-control-item floor-like" :class="{ active: reply.liked }" @click="toggleLikeComment(reply)">
                                                    <div class="floor-control-icon">
                                                        <svg viewBox="0 0 1024 1024" width="10" height="10">
                                                            <path
                                                                d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span class="floor-control-text">{{ (Number(reply.likedCount) || 0) > 0 ? reply.likedCount : 'LIKE' }}</span>
                                                </div>

                                                <div class="floor-control-item floor-reply" @click="toggleReply(reply, comment.commentId)">
                                                    <div class="floor-control-icon">
                                                        <svg viewBox="0 0 1024 1024" width="10" height="10">
                                                            <path
                                                                d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span class="floor-control-text">REPLY</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="floor-status floor-error" v-if="getFloorState(comment)?.error" @click="retryFloorReplies(comment)">
                                    {{ getFloorState(comment).error }}
                                </div>

                                <div class="floor-status floor-empty" v-else-if="!getFloorState(comment)?.loading && (getFloorState(comment)?.items || []).length === 0">暂无回复</div>

                                <button class="floor-more" type="button" v-if="getFloorState(comment)?.hasMore" :disabled="getFloorState(comment)?.loading" @click="loadMoreFloorReplies(comment)">
                                    {{ getFloorState(comment)?.loading ? '加载中...' : '展开更多回复' }}
                                </button>

                                <div class="floor-status floor-end" v-else-if="!getFloorState(comment)?.hasMore && (getFloorState(comment)?.items || []).length > 0">已展示全部回复</div>
                            </div>
                        </div>

                        <!-- 内联回复框 -->
                        <div class="inline-reply-box" v-if="isInlineReplyVisible(comment)">
                            <div class="reply-frame">
                                <div class="frame-corner frame-tl"></div>
                                <div class="frame-corner frame-tr"></div>
                                <div class="frame-corner frame-bl"></div>
                                <div class="frame-corner frame-br"></div>
                            </div>

                            <div class="reply-content">
                                <div class="reply-header">
                                    <span class="reply-prefix">REPLY TO</span>
                                    <span class="reply-target">{{ getUserName(replyingTo?.user || comment.user) }}</span>
                                    <div class="close-reply" @click="cancelReply()">×</div>
                                </div>

                                <div class="reply-input-wrapper">
                                    <textarea v-model="newComment" class="reply-textarea" placeholder="INPUT YOUR REPLY..." :disabled="submitting" @keydown.enter.ctrl="submitComment"></textarea>
                                    <div class="reply-input-border"></div>
                                </div>

                                <div class="reply-actions">
                                    <span class="reply-shortcut-hint">CTRL+ENTER</span>
                                    <div class="reply-buttons">
                                        <button class="cancel-reply-btn" @click="cancelReply()">CANCEL</button>
                                        <button class="send-reply-btn" @click="submitComment" :disabled="!newComment.trim() || submitting">
                                            {{ submitting ? 'SENDING...' : 'SEND' }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 最新评论区域 -->
        <div class="latest-comments-section">
            <div class="section-header">
                <div class="section-title-wrapper">
                    <span class="section-title">LATEST COMMENTS</span>
                    <span class="section-count">[{{ total }}]</span>
                </div>
                <div class="section-line"></div>
            </div>

            <div class="comments-grid">
                <div class="comment-card" v-for="comment in comments" :key="comment.commentId">
                    <div class="card-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>

                    <div class="card-content">
                        <div class="comment-meta">
                            <div class="user-avatar">
                                <img :src="getUserAvatar(comment.user, 40)" :alt="getUserName(comment.user)" />
                                <div class="avatar-frame"></div>
                            </div>
                            <div class="user-info">
                                <span class="username">{{ getUserName(comment.user) }}</span>
                                <span class="timestamp">{{ formatTime(comment.time) }}</span>
                            </div>
                        </div>

                        <CommentText :text="comment.content" :enable-emoji="true" :copyable="true" :show-copy-button="false" @copy-success="handleCopySuccess" @copy-error="handleCopyError" />

                        <div class="comment-controls">
                            <div class="control-item like-control" :class="{ active: comment.liked }" @click="toggleLikeComment(comment)">
                                <div class="control-icon">
                                    <svg viewBox="0 0 1024 1024" width="14" height="14">
                                        <path
                                            d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                        />
                                    </svg>
                                </div>
                                <span class="control-text">{{ comment.likedCount > 0 ? comment.likedCount : 'LIKE' }}</span>
                            </div>

                            <div class="control-item reply-control" @click="toggleReply(comment)">
                                <div class="control-icon">
                                    <svg viewBox="0 0 1024 1024" width="14" height="14">
                                        <path
                                            d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                        />
                                    </svg>
                                </div>
                                <span class="control-text">REPLY</span>
                            </div>
                        </div>

                        <div class="floor-replies" v-if="getCommentReplyCount(comment) > 0">
                            <button class="floor-toggle" type="button" @click="toggleFloorReplies(comment)">
                                <span v-if="!getFloorState(comment)?.expanded">展开{{ getCommentReplyCount(comment) }}条回复</span>
                                <span v-else>收起回复</span>
                            </button>

                            <div class="floor-panel" v-if="getFloorState(comment)?.expanded">
                                <div class="floor-list" v-if="(getFloorState(comment)?.items || []).length > 0">
                                    <div class="floor-item" v-for="reply in getFloorState(comment).items" :key="`floor-${comment.commentId}-${reply.commentId}`">
                                        <div class="floor-avatar">
                                            <img :src="getUserAvatar(reply.user, 24)" :alt="getUserName(reply.user)" />
                                        </div>
                                        <div class="floor-main">
                                            <div class="floor-item-meta">
                                                <span class="floor-username">{{ getUserName(reply.user) }}</span>
                                                <span class="floor-time">{{ formatTime(reply.time) }}</span>
                                            </div>
                                            <CommentText
                                                class="floor-text"
                                                :text="reply.content || ''"
                                                :enable-emoji="true"
                                                :copyable="true"
                                                :show-copy-button="false"
                                                @copy-success="handleCopySuccess"
                                                @copy-error="handleCopyError"
                                            />
                                            <div class="floor-controls">
                                                <div class="floor-control-item floor-like" :class="{ active: reply.liked }" @click="toggleLikeComment(reply)">
                                                    <div class="floor-control-icon">
                                                        <svg viewBox="0 0 1024 1024" width="10" height="10">
                                                            <path
                                                                d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span class="floor-control-text">{{ (Number(reply.likedCount) || 0) > 0 ? reply.likedCount : 'LIKE' }}</span>
                                                </div>

                                                <div class="floor-control-item floor-reply" @click="toggleReply(reply, comment.commentId)">
                                                    <div class="floor-control-icon">
                                                        <svg viewBox="0 0 1024 1024" width="10" height="10">
                                                            <path
                                                                d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span class="floor-control-text">REPLY</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="floor-status floor-error" v-if="getFloorState(comment)?.error" @click="retryFloorReplies(comment)">
                                    {{ getFloorState(comment).error }}
                                </div>

                                <div class="floor-status floor-empty" v-else-if="!getFloorState(comment)?.loading && (getFloorState(comment)?.items || []).length === 0">暂无回复</div>

                                <button class="floor-more" type="button" v-if="getFloorState(comment)?.hasMore" :disabled="getFloorState(comment)?.loading" @click="loadMoreFloorReplies(comment)">
                                    {{ getFloorState(comment)?.loading ? '加载中...' : '展开更多回复' }}
                                </button>

                                <div class="floor-status floor-end" v-else-if="!getFloorState(comment)?.hasMore && (getFloorState(comment)?.items || []).length > 0">已展示全部回复</div>
                            </div>
                        </div>

                        <!-- 内联回复框 -->
                        <div class="inline-reply-box" v-if="isInlineReplyVisible(comment)">
                            <div class="reply-frame">
                                <div class="frame-corner frame-tl"></div>
                                <div class="frame-corner frame-tr"></div>
                                <div class="frame-corner frame-bl"></div>
                                <div class="frame-corner frame-br"></div>
                            </div>

                            <div class="reply-content">
                                <div class="reply-header">
                                    <span class="reply-prefix">REPLY TO</span>
                                    <span class="reply-target">{{ getUserName(replyingTo?.user || comment.user) }}</span>
                                    <div class="close-reply" @click="cancelReply()">×</div>
                                </div>

                                <div class="reply-input-wrapper">
                                    <textarea v-model="newComment" class="reply-textarea" placeholder="INPUT YOUR REPLY..." :disabled="submitting" @keydown.enter.ctrl="submitComment"></textarea>
                                    <div class="reply-input-border"></div>
                                </div>

                                <div class="reply-actions">
                                    <span class="reply-shortcut-hint">CTRL+ENTER</span>
                                    <div class="reply-buttons">
                                        <button class="cancel-reply-btn" @click="cancelReply()">CANCEL</button>
                                        <button class="send-reply-btn" @click="submitComment" :disabled="!newComment.trim() || submitting">
                                            {{ submitting ? 'SENDING...' : 'SEND' }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 状态提示区域 -->
            <div class="status-section">
                <!-- 加载中 -->
                <div class="loading-status" v-if="loading">
                    <div class="loading-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>
                    <div class="loading-content">
                        <div class="loading-indicator"></div>
                        <span class="loading-text">LOADING...</span>
                    </div>
                </div>

                <!-- 暂无更多 -->
                <div class="no-more-status" v-if="!hasMore && comments.length > 0">
                    <div class="status-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>
                    <span class="status-text">NO MORE COMMENTS</span>
                </div>

                <!-- 暂无评论 -->
                <div class="empty-status" v-if="!loading && comments.length === 0 && hotComments.length === 0">
                    <div class="status-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>
                    <span class="status-text">NO COMMENTS YET</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
// 明日方舟风格评论区样式
.arknights-comments {
    width: 100%;
    height: 100%;
    padding: 20px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.35);
    backdrop-filter: blur(10px);
    font-family: SourceHanSansCN-Bold, Bender-Bold, monospace;

    // 自定义滚动条
    &::-webkit-scrollbar {
        width: 3px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.4);

        &:hover {
            background: rgba(0, 0, 0, 0.6);
        }
    }
}

// 通用框架样式
.frame-corner {
    position: absolute;
    width: 8px;
    height: 8px;
    border: 2px solid #000;

    &.frame-tl {
        top: -1px;
        left: -1px;
        border-bottom: none;
        border-right: none;
    }

    &.frame-tr {
        top: -1px;
        right: -1px;
        border-bottom: none;
        border-left: none;
    }

    &.frame-bl {
        bottom: -1px;
        left: -1px;
        border-top: none;
        border-right: none;
    }

    &.frame-br {
        bottom: -1px;
        right: -1px;
        border-top: none;
        border-left: none;
    }
}

// 评论区标题
.comments-header {
    margin-bottom: 24px;

    .header-frame {
        position: relative;
        padding: 16px 24px;
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(0, 0, 0, 0.2);
    }

    .header-title-wrapper {
        text-align: center;
        position: relative;
    }

    .header-title {
        font-family: Bender-Bold, monospace;
        font-size: 18px;
        font-weight: bold;
        color: #000;
        letter-spacing: 2px;
        text-transform: uppercase;
    }

    .title-underline {
        width: 60px;
        height: 2px;
        background: #000;
        margin: 8px auto 0;
    }
}

// 评论输入区域
.comment-input-section {
    margin-bottom: 32px;

    .input-frame {
        position: relative;
        background: rgba(255, 255, 255, 0.3);
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .input-content {
        padding: 20px;
    }

    .reply-info {
        display: flex;
        align-items: center;
        margin-bottom: 16px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.05);
        border-left: 3px solid #000;

        .reply-prefix {
            font-family: Bender-Bold, monospace;
            font-size: 10px;
            color: rgba(0, 0, 0, 0.6);
            margin-right: 8px;
            letter-spacing: 1px;
        }

        .reply-target {
            font-family: SourceHanSansCN-Bold;
            font-size: 12px;
            color: #000;
            font-weight: bold;
            flex: 1;
        }

        .cancel-reply {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.1);
            color: #000;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            transition: all 0.2s;

            &:hover {
                background: rgba(0, 0, 0, 0.2);
                transform: scale(1.1);
            }
        }
    }

    .input-wrapper {
        position: relative;
        margin-bottom: 16px;
    }

    .comment-textarea {
        width: 100%;
        min-height: 80px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.6);
        border: none;
        outline: none;
        font-family: SourceHanSansCN-Bold;
        font-size: 14px;
        color: #000;
        resize: vertical;

        &::placeholder {
            color: rgba(0, 0, 0, 0.4);
            font-family: Bender-Bold, monospace;
            font-size: 12px;
            letter-spacing: 1px;
        }

        &:focus {
            background: rgba(255, 255, 255, 0.8);

            + .input-border {
                border-color: #000;
            }
        }
    }

    .input-border {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 2px solid rgba(0, 0, 0, 0.2);
        pointer-events: none;
        transition: border-color 0.2s;
    }

    .input-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .shortcut-hint {
            font-family: Bender-Bold, monospace;
            font-size: 10px;
            color: rgba(0, 0, 0, 0.5);
            letter-spacing: 1px;
        }

        .submit-button {
            position: relative;
            padding: 10px 20px;
            background: #000;
            color: #fff;
            border: none;
            cursor: pointer;
            font-family: Bender-Bold, monospace;
            font-size: 12px;
            font-weight: bold;
            letter-spacing: 1px;
            transition: all 0.2s;
            text-transform: uppercase;

            &:hover:not(:disabled) {
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-1px);
            }

            &:active:not(:disabled) {
                transform: translateY(0);
            }

            &:disabled {
                background: rgba(0, 0, 0, 0.3);
                cursor: not-allowed;
            }
        }
    }
}

// 未登录提示
.login-prompt {
    margin-bottom: 32px;

    .prompt-frame {
        position: relative;
        padding: 20px;
        background: rgba(255, 255, 255, 0.25);
        border: 1px solid rgba(0, 0, 0, 0.1);
        text-align: center;
    }

    .prompt-text {
        font-family: Bender-Bold, monospace;
        font-size: 14px;
        color: rgba(0, 0, 0, 0.6);
        letter-spacing: 1px;
    }
}

// 区块标题
.section-header {
    display: flex;
    align-items: center;
    margin-bottom: 14px;

    .section-title-wrapper {
        display: flex;
        align-items: baseline;
        margin-right: 12px;
    }

    .section-title {
        font-family: Bender-Bold, monospace;
        font-size: 13px;
        font-weight: bold;
        color: #000;
        letter-spacing: 1px;
        margin-right: 6px;
    }

    .section-count {
        font-family: Bender-Bold, monospace;
        font-size: 11px;
        color: rgba(0, 0, 0, 0.6);
    }

    .section-line {
        flex: 1;
        height: 1px;
        background: rgba(0, 0, 0, 0.2);
    }
}

// 评论区域
.hot-comments-section {
    margin-bottom: 24px;
}

.latest-comments-section {
    .comments-grid {
        margin-bottom: 18px;
    }
}

.comments-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

// 评论卡片
.comment-card {
    position: relative;
    background: rgba(255, 255, 255, 0.28);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-left: 3px solid rgba(0, 0, 0, 0.28);
    transition: all 0.2s;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);

    &:hover {
        background: rgba(255, 255, 255, 0.4);
        transform: translateY(-1px);
    }

    &.hot-card {
        border-left-color: rgba(233, 192, 104, 0.76);
    }

    .card-frame {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
    }

    .card-content {
        position: relative;
        padding: 12px 14px;
    }
}

// 评论元信息
.comment-meta {
    display: flex;
    align-items: center;
    margin-bottom: 8px;

    .user-avatar {
        position: relative;
        margin-right: 10px;

        img {
            width: 28px;
            height: 28px;
            object-fit: cover;
        }

        .avatar-frame {
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            border: 2px solid rgba(0, 0, 0, 0.2);
        }
    }

    .user-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .username {
        font-family: SourceHanSansCN-Bold;
        font-size: 12px;
        font-weight: bold;
        color: #000;
        text-align: left;
    }

    .timestamp {
        font-family: Bender-Bold, monospace;
        font-size: 9px;
        color: rgba(0, 0, 0, 0.5);
        letter-spacing: 0.5px;
        text-align: left;
    }
}

// 评论内容 - 更新为适配CommentText组件
.comment-text {
    font-family: SourceHanSansCN-Bold;
    font-size: 13px;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.45;
    margin-bottom: 9px;
    word-break: break-word;
    text-align: left;
    user-select: text;
    cursor: text;

    // 表情样式优化
    :deep(.emoji) {
        font-size: 16px;
        vertical-align: middle;
        margin: 0 1px;
        display: inline-block;
        animation: none;
        transition: transform 0.2s ease;
    }

    :deep(.emoji:hover) {
        transform: scale(1.1);
    }

    // 移除悬停时的复制提示
    &:hover {
        position: relative;
    }
}

// 评论控制按钮
.comment-controls {
    display: flex;
    align-items: center;
    gap: 12px;

    .control-item {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        transition: all 0.2s;
        padding: 3px 7px;
        background: rgba(0, 0, 0, 0.05);

        &:hover {
            background: rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }

        &.active {
            background: rgba(0, 0, 0, 0.15);

            .control-icon svg {
                fill: #ff4757;
            }

            .control-text {
                color: #ff4757;
            }
        }

        .control-icon {
            display: flex;
            align-items: center;
            justify-content: center;

            svg {
                fill: rgba(0, 0, 0, 0.6);
                transition: fill 0.2s;
            }
        }

        .control-text {
            font-family: Bender-Bold, monospace;
            font-size: 9px;
            color: rgba(0, 0, 0, 0.6);
            letter-spacing: 0.5px;
            font-weight: bold;
        }
    }
}

.floor-replies {
    margin-top: 10px;
    padding-left: 0;

    .floor-toggle {
        border: none;
        margin-top: 0;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.08);
        cursor: pointer;
        font-family: Bender-Bold, monospace;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 0.5px;
        color: rgba(0, 0, 0, 0.68);
        transition: all 0.2s;
        border-radius: 0;
        outline: none;
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;

        &:hover {
            background: rgba(0, 0, 0, 0.14);
            color: rgba(0, 0, 0, 0.86);
        }

        &:focus,
        &:focus-visible {
            outline: none;
            box-shadow: none;
        }
    }

    .floor-panel {
        margin-top: 8px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 0;
    }

    .floor-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .floor-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        background: rgba(176, 209, 217, 0.07);
        border-left: 2px solid rgba(0, 0, 0, 0.2);
        border-radius: 0;
    }

    .floor-avatar {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        border: 1px solid rgba(0, 0, 0, 0.18);
        overflow: hidden;
        border-radius: 0;

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
    }

    .floor-main {
        flex: 1;
        min-width: 0;
    }

    .floor-item-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }

    .floor-username {
        font-family: SourceHanSansCN-Bold;
        font-size: 11px;
        font-weight: bold;
        color: rgba(0, 0, 0, 0.82);
    }

    .floor-time {
        font-family: Bender-Bold, monospace;
        font-size: 9px;
        letter-spacing: 0.4px;
        color: rgba(0, 0, 0, 0.5);
    }

    .floor-text {
        font-family: SourceHanSansCN-Bold;
        font-size: 12px;
        line-height: 1.45;
        color: rgba(0, 0, 0, 0.82);
    }

    .floor-controls {
        margin-top: 5px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .floor-control-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 5px;
        background: rgba(0, 0, 0, 0.05);
        cursor: pointer;
        transition: all 0.2s;
        border-radius: 0;

        &:hover {
            background: rgba(0, 0, 0, 0.11);
            transform: translateY(-1px);
        }

        .floor-control-icon {
            display: flex;
            align-items: center;
            justify-content: center;

            svg {
                fill: rgba(0, 0, 0, 0.58);
                transition: fill 0.2s;
            }
        }

        .floor-control-text {
            font-family: Bender-Bold, monospace;
            font-size: 8px;
            font-weight: bold;
            letter-spacing: 0.4px;
            color: rgba(0, 0, 0, 0.58);
        }

        &.active {
            .floor-control-icon svg,
            .floor-control-text {
                fill: #ff4757;
                color: #ff4757;
            }
        }
    }

    .floor-more {
        margin-top: 8px;
        border: none;
        background: rgba(0, 0, 0, 0.08);
        color: rgba(0, 0, 0, 0.68);
        font-family: Bender-Bold, monospace;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 0.5px;
        padding: 4px 8px;
        cursor: pointer;
        transition: all 0.2s;
        border-radius: 0;
        outline: none;
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;

        &:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.14);
            color: rgba(0, 0, 0, 0.86);
        }

        &:focus,
        &:focus-visible {
            outline: none;
            box-shadow: none;
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .floor-status {
        margin-top: 8px;
        font-family: Bender-Bold, monospace;
        font-size: 9px;
        letter-spacing: 0.5px;
        color: rgba(0, 0, 0, 0.56);
    }

    .floor-error {
        color: #d64545;
        cursor: pointer;

        &:hover {
            color: #b82f2f;
        }
    }
}

// 状态区域
.status-section {
    display: flex;
    justify-content: center;
    margin-top: 24px;
}

// 加载状态
.loading-status {
    position: relative;
    padding: 16px 24px;
    background: rgba(255, 255, 255, 0.25);
    border: 1px solid rgba(0, 0, 0, 0.1);

    .loading-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
    }

    .loading-indicator {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 0, 0, 0.2);
        border-top: 2px solid #000;
        animation: arknights-spin 1s linear infinite;
    }

    .loading-text {
        font-family: Bender-Bold, monospace;
        font-size: 12px;
        color: rgba(0, 0, 0, 0.6);
        letter-spacing: 1px;
    }
}

// 其他状态
.no-more-status,
.empty-status {
    position: relative;
    padding: 16px 24px;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(0, 0, 0, 0.08);
    text-align: center;

    .status-text {
        font-family: Bender-Bold, monospace;
        font-size: 12px;
        color: rgba(0, 0, 0, 0.5);
        letter-spacing: 1px;
    }
}

// 动画
@keyframes arknights-spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

// 响应式设计
// 内联回复框样式
.inline-reply-box {
    margin-top: 12px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(0, 0, 0, 0.1);
    position: relative;

    .reply-frame {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
    }

    .reply-content {
        position: relative;
        padding: 12px;
    }

    .reply-header {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        padding: 5px 8px;
        background: rgba(0, 0, 0, 0.05);
        border-left: 2px solid #000;

        .reply-prefix {
            font-family: Bender-Bold, monospace;
            font-size: 8px;
            color: rgba(0, 0, 0, 0.6);
            margin-right: 6px;
            letter-spacing: 1px;
        }

        .reply-target {
            font-family: SourceHanSansCN-Bold;
            font-size: 10px;
            color: #000;
            font-weight: bold;
            flex: 1;
        }

        .close-reply {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.1);
            color: #000;
            cursor: pointer;
            font-size: 12px;
            line-height: 1;
            transition: all 0.2s;

            &:hover {
                background: rgba(0, 0, 0, 0.2);
                transform: scale(1.1);
            }
        }
    }

    .reply-input-wrapper {
        position: relative;
        margin-bottom: 10px;
    }

    .reply-textarea {
        width: 100%;
        min-height: 52px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.6);
        border: none;
        outline: none;
        font-family: SourceHanSansCN-Bold;
        font-size: 12px;
        color: #000;
        resize: vertical;

        &::placeholder {
            color: rgba(0, 0, 0, 0.4);
            font-family: Bender-Bold, monospace;
            font-size: 10px;
            letter-spacing: 0.5px;
        }

        &:focus {
            background: rgba(255, 255, 255, 0.8);

            + .reply-input-border {
                border-color: #000;
            }
        }
    }

    .reply-input-border {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 1px solid rgba(0, 0, 0, 0.2);
        pointer-events: none;
        transition: border-color 0.2s;
    }

    .reply-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .reply-shortcut-hint {
            font-family: Bender-Bold, monospace;
            font-size: 9px;
            color: rgba(0, 0, 0, 0.5);
            letter-spacing: 0.5px;
        }

        .reply-buttons {
            display: flex;
            gap: 8px;
        }

        .cancel-reply-btn,
        .send-reply-btn {
            padding: 5px 10px;
            border: none;
            cursor: pointer;
            font-family: Bender-Bold, monospace;
            font-size: 9px;
            font-weight: bold;
            letter-spacing: 0.5px;
            transition: all 0.2s;
            text-transform: uppercase;

            &:hover {
                transform: translateY(-1px);
            }

            &:active {
                transform: translateY(0);
            }
        }

        .cancel-reply-btn {
            background: rgba(0, 0, 0, 0.1);
            color: rgba(0, 0, 0, 0.7);

            &:hover {
                background: rgba(0, 0, 0, 0.15);
            }
        }

        .send-reply-btn {
            background: #000;
            color: #fff;

            &:hover:not(:disabled) {
                background: rgba(0, 0, 0, 0.8);
            }

            &:disabled {
                background: rgba(0, 0, 0, 0.3);
                cursor: not-allowed;
                transform: none;
            }
        }
    }
}

@media (max-width: 768px) {
    .arknights-comments {
        padding: 16px;
    }

    .comment-card .card-content {
        padding: 10px 12px;
    }

    .comment-meta .user-avatar {
        img {
            width: 24px;
            height: 24px;
        }
    }

    .header-title {
        font-size: 16px;
    }

    .section-title {
        font-size: 12px;
    }

    .floor-replies {
        padding-left: 0;

        .floor-panel {
            padding: 7px 8px;
        }

        .floor-item {
            padding: 5px 6px;
            gap: 6px;
        }

        .floor-avatar {
            width: 20px;
            height: 20px;
        }

        .floor-toggle,
        .floor-more,
        .floor-status {
            font-size: 9px;
        }

        .floor-text {
            font-size: 11px;
        }

        .floor-controls {
            gap: 6px;
        }

        .floor-control-item {
            padding: 2px 4px;
        }

        .floor-control-item .floor-control-text {
            font-size: 8px;
        }
    }
}
</style>
