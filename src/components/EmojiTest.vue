<!--
  表情测试页面 - 用于验证表情解析功能
-->
<template>
  <div class="emoji-test-page">
    <h2>网易云音乐表情解析测试</h2>
    
    <div class="test-section">
      <h3>表情测试样例</h3>
      <div class="test-cases">
        <div class="test-case" v-for="testText in testTexts" :key="testText">
          <div class="original-text">
            <strong>原文：</strong>{{ testText }}
          </div>
          <div class="parsed-text">
            <strong>解析后：</strong>
            <CommentText
              :text="testText"
              :enable-emoji="true"
              :copyable="true"
              @copy-success="handleCopySuccess"
              @copy-error="handleCopyError"
            />
          </div>
        </div>
      </div>
    </div>
    
    <div class="test-section">
      <h3>自定义测试</h3>
      <div class="custom-test">
        <textarea
          v-model="customText"
          placeholder="输入包含表情的文字，如：今天心情很好[大笑][呲牙]"
          rows="3"
          style="width: 100%; margin-bottom: 10px; padding: 10px;"
        ></textarea>
        <div class="custom-result">
          <strong>解析结果：</strong>
          <CommentText
            :text="customText"
            :enable-emoji="true"
            :copyable="true"
            @copy-success="handleCopySuccess"
            @copy-error="handleCopyError"
          />
        </div>
      </div>
    </div>
    
    <div class="test-section">
      <h3>所有支持的表情</h3>
      <div class="emoji-grid">
        <div class="emoji-item" v-for="[text, emoji] in emojiList" :key="text">
          <span class="emoji-text">{{ text }}</span>
          <span class="emoji-display">{{ emoji }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import CommentText from './CommentText.vue'
import { ALL_EMOJI_MAP } from '../utils/emojiParser'
import { noticeOpen } from '../utils/dialog'

const customText = ref('今天心情很好[大笑][呲牙]，听了一首很棒的歌[音乐][爱心]')

const testTexts = [
  '今天心情真好[大笑][呲牙]',
  '听到这首歌我就[大哭][多多大哭]',
  '这首歌太棒了[强][爱心][音乐]',
  '无语了[白眼][鄙视]，什么歌啊',
  '好困啊[睡][困]，但还是要听完',
  '这个MV拍得真[酷][惊讶]',
  '[太阳]天气不错，适合听歌[咖啡]',
  '生日快乐[蛋糕][礼物][玫瑰]',
  '哈哈哈[笑哭][奸笑][嘿哈]',
  '心情复杂[悲伤][委屈][泪]但又[得意][可爱]'
]

const emojiList = computed(() => {
  return Object.entries(ALL_EMOJI_MAP).sort()
})

const handleCopySuccess = (text) => {
  noticeOpen(`已复制: ${text}`, 1)
}

const handleCopyError = (error) => {
  noticeOpen('复制失败', 2)
}
</script>

<style scoped>
.emoji-test-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.test-section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.test-case {
  margin-bottom: 15px;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 1px solid #eee;
}

.original-text {
  margin-bottom: 8px;
  color: #666;
  font-size: 14px;
}

.parsed-text {
  font-size: 16px;
}

.custom-test {
  background: white;
  padding: 15px;
  border-radius: 6px;
}

.custom-result {
  margin-top: 10px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 10px;
  background: white;
  border-radius: 6px;
}

.emoji-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 8px;
  background: #f8f8f8;
  border-radius: 4px;
  font-size: 14px;
}

.emoji-text {
  color: #666;
  font-family: monospace;
}

.emoji-display {
  font-size: 18px;
}

h2 {
  color: #333;
  margin-bottom: 20px;
}

h3 {
  color: #444;
  margin-bottom: 15px;
  border-bottom: 2px solid #eee;
  padding-bottom: 5px;
}
</style>