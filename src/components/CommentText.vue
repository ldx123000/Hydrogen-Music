<!--
  评论文本渲染组件
  支持表情解析和文字复制功能
-->
<template>
  <div 
    class="comment-text" 
    :class="{ 'copyable': copyable }"
    @dblclick="handleDoubleClick"
  >
    <template v-if="enableEmoji">
      <span 
        v-for="(segment, index) in parsedSegments" 
        :key="index"
        :class="{
          'text-segment': segment.type === 'text',
          'emoji-segment': segment.type === 'emoji'
        }"
      >
        <template v-if="segment.type === 'emoji'">
          <span 
            class="emoji" 
            :title="segment.original"
          >{{ segment.content }}</span>
        </template>
        <template v-else>{{ segment.content }}</template>
      </span>
    </template>
    <template v-else>
      {{ text }}
    </template>
    
    <!-- 复制按钮（可选） -->
    <button 
      v-if="showCopyButton && copyable" 
      class="copy-button"
      @click="handleCopyClick"
      :disabled="copying"
      :title="copying ? '复制中...' : '复制文本'"
    >
      <svg 
        v-if="!copying" 
        class="copy-icon" 
        viewBox="0 0 24 24" 
        width="14" 
        height="14"
      >
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
      </svg>
      <svg 
        v-else 
        class="copy-icon loading" 
        viewBox="0 0 24 24" 
        width="14" 
        height="14"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { parseTextWithEmoji } from '../utils/emojiParser'
import { copyCommentText } from '../utils/clipboard'

const props = defineProps({
  // 要显示的文本
  text: {
    type: String,
    required: true
  },
  // 是否启用表情解析
  enableEmoji: {
    type: Boolean,
    default: true
  },
  // 是否支持复制
  copyable: {
    type: Boolean,
    default: true
  },
  // 是否显示复制按钮
  showCopyButton: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['copy-success', 'copy-error'])

const copying = ref(false)

// 解析文本，分离文字和表情
const parsedSegments = computed(() => {
  if (!props.enableEmoji || !props.text) {
    return [{ type: 'text', content: props.text || '' }]
  }
  
  return parseTextWithEmoji(props.text)
})

// 处理双击复制
const handleDoubleClick = async (event) => {
  if (!props.copyable) return
  
  event.preventDefault()
  await copyText()
}

// 处理复制按钮点击
const handleCopyClick = async (event) => {
  event.preventDefault()
  event.stopPropagation()
  await copyText()
}

// 执行复制操作
const copyText = async () => {
  if (copying.value || !props.text) return
  
  copying.value = true
  
  try {
    const success = await copyCommentText(props.text)
    
    if (success) {
      emit('copy-success', props.text)
    } else {
      emit('copy-error', new Error('复制失败'))
    }
  } catch (error) {
    emit('copy-error', error)
  } finally {
    copying.value = false
  }
}
</script>

<style scoped>
.comment-text {
  position: relative;
  word-break: break-word;
  line-height: 1.5;
  cursor: text;
  user-select: text;
}

.comment-text.copyable {
  cursor: pointer;
}

.comment-text.copyable:hover {
  /* 移除 hover 时的背景变化，保持原样 */
}

.text-segment {
  color: inherit;
}

.emoji-segment {
  display: inline;
}

.emoji {
  display: inline-block;
  font-size: 1.1em;
  vertical-align: middle;
  margin: 0 1px;
  cursor: help;
  transition: transform 0.2s ease;
}

.emoji:hover {
  transform: scale(1.2);
}

.copy-button {
  position: absolute;
  top: -2px;
  right: -2px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.comment-text:hover .copy-button {
  opacity: 1;
}

.copy-button:hover {
  background: rgba(0, 0, 0, 0.9);
}

.copy-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.copy-icon {
  fill: currentColor;
  color: #fff;
}

.copy-icon.loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 选中文本的样式 */
.comment-text::selection {
  background-color: rgba(33, 150, 243, 0.3);
}

.comment-text::-moz-selection {
  background-color: rgba(33, 150, 243, 0.3);
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .comment-text.copyable:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .copy-button {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .copy-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .copy-button {
    position: static;
    opacity: 1;
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  .emoji {
    font-size: 1em;
  }
  
  .comment-text.copyable:hover {
    background-color: transparent;
    padding: 0;
    margin: 0;
  }
}
</style>