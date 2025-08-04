<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { getMusicComments, postMusicComment, likeMusicComment } from '../api/song';
import { usePlayerStore } from '../store/playerStore';
import { useUserStore } from '../store/userStore';
import { storeToRefs } from 'pinia';
import { noticeOpen } from '../utils/dialog';

const playerStore = usePlayerStore();
const userStore = useUserStore();
const { songId, songList, currentIndex } = storeToRefs(playerStore);

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
            id: songId.value,
            limit: limit.value,
            offset: reset ? 0 : offset.value,
        };

        const response = await getMusicComments(params);

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
        const params = {
            id: songId.value,
            content: newComment.value.trim(),
        };

        if (replyingTo.value) {
            params.commentId = replyingTo.value.commentId;
        }

        const response = await postMusicComment(params);

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
        const params = {
            id: songId.value,
            cid: comment.commentId,
            t: comment.liked ? 0 : 1,
        };

        const response = await likeMusicComment(params);

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
const replyComment = comment => {
    replyingTo.value = comment;
    newComment.value = `@${comment.user.nickname} `;
};

// 取消回复
const cancelReply = () => {
    replyingTo.value = null;
    newComment.value = '';
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
watch(
    songId,
    newSongId => {
        if (newSongId) {
            fetchComments(true);
        }
    },
    { immediate: true }
);

onMounted(() => {
    // 组件挂载时获取评论
    if (songId.value) {
        fetchComments(true);
    }
});
</script>

<template>
    <div class="comments-container">
        <!-- 评论区标题 -->
        <div class="comments-header">
            <div class="header-line"></div>
            <span class="header-title">评论区</span>
            <div class="header-line"></div>
        </div>

        <!-- 发表评论 -->
        <div class="comment-input-section" v-if="userStore.user">
            <div class="comment-input-wrapper">
                <div class="reply-info" v-if="replyingTo">
                    <span class="reply-text">回复 @{{ replyingTo.user.nickname }}</span>
                    <span class="cancel-reply" @click="cancelReply">取消</span>
                </div>
                <textarea v-model="newComment" class="comment-input" placeholder="发表评论..." :disabled="submitting" @keydown.enter.ctrl="submitComment"></textarea>
                <div class="input-actions">
                    <span class="input-tip">Ctrl+Enter 发送</span>
                    <button class="submit-btn" @click="submitComment" :disabled="!newComment.trim() || submitting">
                        {{ submitting ? '发送中...' : '发送' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 未登录提示 -->
        <div class="login-tip" v-else>
            <span>请登录后发表评论</span>
        </div>

        <!-- 精彩评论 -->
        <div class="hot-comments" v-if="hotComments.length > 0">
            <div class="section-title">
                <span class="title-text">精彩评论</span>
                <span class="comment-count">({{ hotComments.length }})</span>
            </div>

            <div class="comment-list">
                <div class="comment-item hot-comment" v-for="comment in hotComments" :key="comment.commentId">
                    <div class="comment-avatar">
                        <img :src="comment.user.avatarUrl + '?param=40y40'" :alt="comment.user.nickname" />
                    </div>

                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="user-name">{{ comment.user.nickname }}</span>
                            <span class="comment-time">{{ formatTime(comment.time) }}</span>
                        </div>

                        <div class="comment-text">{{ comment.content }}</div>

                        <div class="comment-actions">
                            <div class="action-item" @click="toggleLikeComment(comment)">
                                <svg class="icon like-icon" :class="{ liked: comment.liked }" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                                    <path
                                        d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                    />
                                </svg>
                                <span class="like-count">{{ comment.likedCount > 0 ? comment.likedCount : '' }}</span>
                            </div>

                            <div class="action-item" @click="replyComment(comment)">
                                <svg class="icon reply-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                                    <path
                                        d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                    />
                                </svg>
                                <span>回复</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 最新评论 -->
        <div class="latest-comments">
            <div class="section-title">
                <span class="title-text">最新评论</span>
                <span class="comment-count">({{ total }})</span>
            </div>

            <div class="comment-list">
                <div class="comment-item" v-for="comment in comments" :key="comment.commentId">
                    <div class="comment-avatar">
                        <img :src="comment.user.avatarUrl + '?param=40y40'" :alt="comment.user.nickname" />
                    </div>

                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="user-name">{{ comment.user.nickname }}</span>
                            <span class="comment-time">{{ formatTime(comment.time) }}</span>
                        </div>

                        <div class="comment-text">{{ comment.content }}</div>

                        <div class="comment-actions">
                            <div class="action-item" @click="toggleLikeComment(comment)">
                                <svg class="icon like-icon" :class="{ liked: comment.liked }" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                                    <path
                                        d="M736.603 35.674c-87.909 0-169.647 44.1-223.447 116.819C459.387 79.756 377.665 35.674 289.708 35.674c-158.47 0-287.397 140.958-287.397 314.233 0 103.371 46.177 175.887 83.296 234.151 107.88 169.236 379.126 379.846 390.616 388.725 11.068 8.557 24.007 12.837 36.917 12.837 12.939 0 25.861-4.28 36.917-12.837 11.503-8.879 282.765-219.488 390.614-388.725C977.808 525.793 1024 453.277 1024 349.907 1023.999 176.632 895.071 35.674 736.603 35.674z"
                                    />
                                </svg>
                                <span class="like-count">{{ comment.likedCount > 0 ? comment.likedCount : '' }}</span>
                            </div>

                            <div class="action-item" @click="replyComment(comment)">
                                <svg class="icon reply-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                                    <path
                                        d="M853.333333 85.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v469.333333a85.333333 85.333333 0 0 1-85.333334 85.333333H298.666667L128 896V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h640z m0 85.333334H213.333333v530.773333L285.44 640H853.333333V170.666667z m-256 128v85.333333H256v-85.333333h341.333333z m0 170.666666v85.333334H256v-85.333334h341.333333z"
                                    />
                                </svg>
                                <span>回复</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 加载更多 -->
            <div class="load-more" v-if="hasMore && !loading" @click="fetchComments">
                <span>加载更多评论</span>
            </div>

            <!-- 加载中 -->
            <div class="loading" v-if="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
            </div>

            <!-- 暂无更多 -->
            <div class="no-more" v-if="!hasMore && comments.length > 0">
                <span>没有更多评论了</span>
            </div>

            <!-- 暂无评论 -->
            <div class="no-comments" v-if="!loading && comments.length === 0 && hotComments.length === 0">
                <span>暂无评论，快来抢沙发吧~</span>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.comments-container {
    width: 100%;
    height: 100%;
    padding: 20px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.35);
    backdrop-filter: blur(10px);

    &::-webkit-scrollbar {
        width: 4px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 2px;

        &:hover {
            background: rgba(0, 0, 0, 0.5);
        }
    }
}

.comments-header {
    display: flex;
    align-items: center;
    margin-bottom: 20px;

    .header-line {
        flex: 1;
        height: 1px;
        background: rgba(0, 0, 0, 0.2);
    }

    .header-title {
        margin: 0 15px;
        font: 16px SourceHanSansCN-Bold;
        color: black;
        font-weight: bold;
    }
}

.comment-input-section {
    margin-bottom: 30px;

    .comment-input-wrapper {
        padding: 15px;
        background: rgba(255, 255, 255, 0.6);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;

        .reply-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 12px;
            color: rgba(0, 0, 0, 0.6);

            .cancel-reply {
                color: #1890ff;
                cursor: pointer;

                &:hover {
                    text-decoration: underline;
                }
            }
        }

        .comment-input {
            width: 100%;
            min-height: 80px;
            padding: 10px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 4px;
            resize: vertical;
            font-family: SourceHanSansCN-Bold;
            font-size: 14px;
            background: rgba(255, 255, 255, 0.8);

            &:focus {
                outline: none;
                border-color: rgba(0, 0, 0, 0.3);
            }

            &::placeholder {
                color: rgba(0, 0, 0, 0.4);
            }
        }

        .input-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;

            .input-tip {
                font-size: 12px;
                color: rgba(0, 0, 0, 0.5);
            }

            .submit-btn {
                padding: 8px 20px;
                background: black;
                color: white;
                border: none;
                border-radius: 4px;
                font: 12px SourceHanSansCN-Bold;
                cursor: pointer;
                transition: 0.2s;

                &:hover:not(:disabled) {
                    background: rgba(0, 0, 0, 0.8);
                }

                &:disabled {
                    background: rgba(0, 0, 0, 0.3);
                    cursor: not-allowed;
                }
            }
        }
    }
}

.login-tip {
    text-align: center;
    padding: 20px;
    color: rgba(0, 0, 0, 0.5);
    font: 14px SourceHanSansCN-Bold;
}

.section-title {
    display: flex;
    align-items: center;
    margin-bottom: 15px;

    .title-text {
        font: 14px SourceHanSansCN-Bold;
        color: black;
        font-weight: bold;
    }

    .comment-count {
        margin-left: 5px;
        font: 12px SourceHanSansCN-Bold;
        color: rgba(0, 0, 0, 0.5);
    }
}

.hot-comments {
    margin-bottom: 30px;

    .hot-comment {
        background: rgba(255, 248, 225, 0.6);
        border-left: 3px solid #ff9800;
    }
}

.comment-list {
    .comment-item {
        display: flex;
        padding: 15px;
        margin-bottom: 10px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 8px;
        transition: 0.2s;

        &:hover {
            background: rgba(255, 255, 255, 0.6);
        }

        .comment-avatar {
            margin-right: 12px;

            img {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 1px solid rgba(0, 0, 0, 0.1);
            }
        }

        .comment-content {
            flex: 1;

            .comment-header {
                display: flex;
                align-items: center;
                margin-bottom: 8px;

                .user-name {
                    font: 13px SourceHanSansCN-Bold;
                    color: black;
                    font-weight: bold;
                    margin-right: 10px;
                }

                .comment-time {
                    font: 11px SourceHanSansCN-Bold;
                    color: rgba(0, 0, 0, 0.5);
                }
            }

            .comment-text {
                font: 14px SourceHanSansCN-Bold;
                color: rgba(0, 0, 0, 0.8);
                line-height: 1.4;
                margin-bottom: 10px;
                word-break: break-word;
                text-align: left;
            }

            .comment-actions {
                display: flex;
                align-items: center;
                gap: 20px;

                .action-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font: 12px SourceHanSansCN-Bold;
                    color: rgba(0, 0, 0, 0.5);
                    cursor: pointer;
                    transition: 0.2s;

                    &:hover {
                        color: rgba(0, 0, 0, 0.8);
                    }

                    .icon {
                        fill: currentColor;
                    }

                    .like-icon.liked {
                        color: #ff4757;
                    }
                }
            }
        }
    }
}

.load-more {
    text-align: center;
    padding: 15px;
    color: rgba(0, 0, 0, 0.6);
    font: 13px SourceHanSansCN-Bold;
    cursor: pointer;
    transition: 0.2s;

    &:hover {
        color: black;
    }
}

.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    color: rgba(0, 0, 0, 0.6);
    font: 13px SourceHanSansCN-Bold;

    .loading-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 0, 0, 0.1);
        border-top: 2px solid rgba(0, 0, 0, 0.6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
}

.no-more,
.no-comments {
    text-align: center;
    padding: 20px;
    color: rgba(0, 0, 0, 0.5);
    font: 13px SourceHanSansCN-Bold;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
