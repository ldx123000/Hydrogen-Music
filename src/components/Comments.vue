<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getMusicComments, postMusicComment, likeMusicComment } from '../api/song';
import { getDjProgramComments, postDjProgramComment, likeDjProgramComment } from '../api/dj';
import { usePlayerStore } from '../store/playerStore';
import { useUserStore } from '../store/userStore';
import { storeToRefs } from 'pinia';
import { noticeOpen } from '../utils/dialog';
import CommentText from './CommentText.vue';

const playerStore = usePlayerStore();
const userStore = useUserStore();
const { songId, songList, currentIndex, listInfo } = storeToRefs(playerStore);
const isDj = computed(() => listInfo.value && listInfo.value.type === 'dj');
const programId = computed(() => {
    const cur = songList.value && songList.value[currentIndex.value];
    return cur && (cur.programId || cur.programID || cur.programid);
});

const comments = ref([]);
const hotComments = ref([]);
const loading = ref(false);
const total = ref(0);
const hasMore = ref(true);
const offset = ref(0);
const limit = ref(20);
const newComment = ref('');
const replyingTo = ref(null);
const submitting = ref(false);

// 获取评论数据
const fetchComments = async (reset = false) => {
    if (loading.value || (!hasMore.value && !reset)) return;

    loading.value = true;

    try {
        const params = {
            limit: limit.value,
            offset: reset ? 0 : offset.value,
        };

        let response = null;
        if (isDj.value && programId.value) {
            response = await getDjProgramComments(programId.value, params);
        } else {
            response = await getMusicComments({ id: songId.value, ...params });
        }

        if (response && response.code === 200) {
            if (reset) {
                comments.value = response.comments || [];
                hotComments.value = response.hotComments || [];
                offset.value = 0;
            } else {
                comments.value.push(...(response.comments || []));
            }

            total.value = response.total || 0;
            offset.value += limit.value;
            hasMore.value = (response.comments || []).length === limit.value;
        }
    } catch (error) {
        console.error('获取评论失败:', error);
        noticeOpen('获取评论失败', 2);
    } finally {
        loading.value = false;
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
                id: songId.value,
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
            response = await likeMusicComment({ id: songId.value, cid: comment.commentId, t: comment.liked ? 0 : 1 });
        }

        if (response && response.code === 200) {
            comment.liked = !comment.liked;
            comment.likedCount += comment.liked ? 1 : -1;
        }
    } catch (error) {
        console.error('点赞失败:', error);
        noticeOpen('操作失败', 2);
    }
};

// 回复评论
const toggleReply = comment => {
    if (replyingTo.value && replyingTo.value.commentId === comment.commentId) {
        // 如果点击的是当前正在回复的评论，则取消回复
        cancelReply();
    } else {
        // 否则开始回复这个评论
        replyingTo.value = comment;
        newComment.value = `@${comment.user.nickname} `;
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
const handleCopySuccess = text => {
    noticeOpen('评论已复制到剪贴板', 1);
};

// 处理复制失败
const handleCopyError = error => {
    noticeOpen('复制失败，请手动选择文字复制', 2);
    console.warn('复制评论失败:', error);
};

// 格式化时间
const formatTime = timestamp => {
    const now = Date.now();
    const diff = now - timestamp;

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

// 监听歌曲变化
watch([songId, programId, isDj], () => {
    // 只要目标变了就刷新
    if ((isDj.value && programId.value) || (!isDj.value && songId.value)) {
        fetchComments(true);
    }
}, { immediate: true });

onMounted(() => {
    if ((isDj.value && programId.value) || (!isDj.value && songId.value)) fetchComments(true);
});
</script>

<template>
    <div class="arknights-comments">
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
                                <img :src="comment.user.avatarUrl + '?param=40y40'" :alt="comment.user.nickname" />
                                <div class="avatar-frame"></div>
                            </div>
                            <div class="user-info">
                                <span class="username">{{ comment.user.nickname }}</span>
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

                        <!-- 内联回复框 -->
                        <div class="inline-reply-box" v-if="replyingTo && replyingTo.commentId === comment.commentId">
                            <div class="reply-frame">
                                <div class="frame-corner frame-tl"></div>
                                <div class="frame-corner frame-tr"></div>
                                <div class="frame-corner frame-bl"></div>
                                <div class="frame-corner frame-br"></div>
                            </div>

                            <div class="reply-content">
                                <div class="reply-header">
                                    <span class="reply-prefix">REPLY TO</span>
                                    <span class="reply-target">{{ comment.user.nickname }}</span>
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
                                <img :src="comment.user.avatarUrl + '?param=40y40'" :alt="comment.user.nickname" />
                                <div class="avatar-frame"></div>
                            </div>
                            <div class="user-info">
                                <span class="username">{{ comment.user.nickname }}</span>
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

                        <!-- 内联回复框 -->
                        <div class="inline-reply-box" v-if="replyingTo && replyingTo.commentId === comment.commentId">
                            <div class="reply-frame">
                                <div class="frame-corner frame-tl"></div>
                                <div class="frame-corner frame-tr"></div>
                                <div class="frame-corner frame-bl"></div>
                                <div class="frame-corner frame-br"></div>
                            </div>

                            <div class="reply-content">
                                <div class="reply-header">
                                    <span class="reply-prefix">REPLY TO</span>
                                    <span class="reply-target">{{ comment.user.nickname }}</span>
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
                <!-- 加载更多 -->
                <div class="load-more-button" v-if="hasMore && !loading" @click="fetchComments(false)">
                    <div class="button-frame">
                        <div class="frame-corner frame-tl"></div>
                        <div class="frame-corner frame-tr"></div>
                        <div class="frame-corner frame-bl"></div>
                        <div class="frame-corner frame-br"></div>
                    </div>
                    <span class="button-text">LOAD MORE</span>
                </div>

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
    margin-bottom: 20px;

    .section-title-wrapper {
        display: flex;
        align-items: baseline;
        margin-right: 16px;
    }

    .section-title {
        font-family: Bender-Bold, monospace;
        font-size: 14px;
        font-weight: bold;
        color: #000;
        letter-spacing: 1px;
        margin-right: 8px;
    }

    .section-count {
        font-family: Bender-Bold, monospace;
        font-size: 12px;
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
    margin-bottom: 32px;
}

.latest-comments-section {
    .comments-grid {
        margin-bottom: 24px;
    }
}

.comments-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

// 评论卡片
.comment-card {
    position: relative;
    background: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: all 0.2s;

    &:hover {
        background: rgba(255, 255, 255, 0.45);
        transform: translateY(-1px);
    }

    &.hot-card {
        background: rgba(255, 248, 225, 0.4);

        &:hover {
            background: rgba(255, 248, 225, 0.6);
        }
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
        padding: 16px 20px;
    }
}

// 评论元信息
.comment-meta {
    display: flex;
    align-items: center;
    margin-bottom: 12px;

    .user-avatar {
        position: relative;
        margin-right: 12px;

        img {
            width: 32px;
            height: 32px;
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
        gap: 2px;
    }

    .username {
        font-family: SourceHanSansCN-Bold;
        font-size: 13px;
        font-weight: bold;
        color: #000;
        text-align: left;
    }

    .timestamp {
        font-family: Bender-Bold, monospace;
        font-size: 10px;
        color: rgba(0, 0, 0, 0.5);
        letter-spacing: 0.5px;
        text-align: left;
    }
}

// 评论内容 - 更新为适配CommentText组件
.comment-text {
    font-family: SourceHanSansCN-Bold;
    font-size: 14px;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.5;
    margin-bottom: 12px;
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
    gap: 20px;

    .control-item {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s;
        padding: 4px 8px;
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
            font-size: 10px;
            color: rgba(0, 0, 0, 0.6);
            letter-spacing: 0.5px;
            font-weight: bold;
        }
    }
}

// 状态区域
.status-section {
    display: flex;
    justify-content: center;
    margin-top: 24px;
}

// 加载更多按钮
.load-more-button {
    position: relative;
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(0, 0, 0, 0.15);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: rgba(255, 255, 255, 0.45);
        transform: translateY(-1px);
    }

    .button-text {
        font-family: Bender-Bold, monospace;
        font-size: 12px;
        color: #000;
        letter-spacing: 1px;
        font-weight: bold;
    }
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
    margin-top: 16px;
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
        padding: 16px;
    }

    .reply-header {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.05);
        border-left: 2px solid #000;

        .reply-prefix {
            font-family: Bender-Bold, monospace;
            font-size: 9px;
            color: rgba(0, 0, 0, 0.6);
            margin-right: 8px;
            letter-spacing: 1px;
        }

        .reply-target {
            font-family: SourceHanSansCN-Bold;
            font-size: 11px;
            color: #000;
            font-weight: bold;
            flex: 1;
        }

        .close-reply {
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.1);
            color: #000;
            cursor: pointer;
            font-size: 14px;
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
        margin-bottom: 12px;
    }

    .reply-textarea {
        width: 100%;
        min-height: 60px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.6);
        border: none;
        outline: none;
        font-family: SourceHanSansCN-Bold;
        font-size: 13px;
        color: #000;
        resize: vertical;

        &::placeholder {
            color: rgba(0, 0, 0, 0.4);
            font-family: Bender-Bold, monospace;
            font-size: 11px;
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
            padding: 6px 12px;
            border: none;
            cursor: pointer;
            font-family: Bender-Bold, monospace;
            font-size: 10px;
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
        padding: 12px 16px;
    }

    .comment-meta .user-avatar {
        img {
            width: 28px;
            height: 28px;
        }
    }

    .header-title {
        font-size: 16px;
    }

    .section-title {
        font-size: 12px;
    }
}
</style>
