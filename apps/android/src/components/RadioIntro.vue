<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { storeToRefs } from 'pinia'
import { getDjDetail } from '../api/dj'

const playerStore = usePlayerStore()
const { listInfo } = storeToRefs(playerStore)

const loading = ref(false)
const error = ref(null)
const detail = ref(null)

const rid = computed(() => listInfo.value && listInfo.value.type === 'dj' ? listInfo.value.id : null)

const loadDetail = async () => {
  if (!rid.value) return
  loading.value = true
  error.value = null
  try {
    const res = await getDjDetail(rid.value)
    // 兼容不同结构
    detail.value = res?.data || res?.djRadio || res || null
  } catch (e) {
    error.value = '加载电台信息失败'
  } finally {
    loading.value = false
  }
}

watch(rid, () => { detail.value = null; if (rid.value) loadDetail() })
onMounted(loadDetail)

const coverUrl = computed(() => (detail.value?.picUrl || detail.value?.intervenePicUrl) ? `${detail.value.picUrl || detail.value.intervenePicUrl}?param=300y300` : '')
const name = computed(() => detail.value?.name || '电台')
const djName = computed(() => detail.value?.dj?.nickname || '')
const desc = computed(() => detail.value?.desc || detail.value?.rcmdtext || '暂无简介')
const programCount = computed(() => detail.value?.programCount || 0)
const subCount = computed(() => detail.value?.subCount || 0)
</script>

<template>
  <div class="radio-intro">
    <div class="intro-header">
      <div class="cover"><img v-if="coverUrl" :src="coverUrl" alt="" /></div>
      <div class="meta">
        <div class="title">{{ name }}</div>
        <div class="sub">{{ djName }}<span v-if="djName && (programCount || subCount)" class="dot">·</span><span v-if="programCount">{{ programCount }} 期</span><span v-if="subCount"> · {{ subCount }} 订阅</span></div>
      </div>
    </div>
    <div class="intro-content">
      <div v-if="loading" class="status">加载中...</div>
      <div v-else-if="error" class="status">{{ error }}</div>
      <div v-else class="desc" v-text="desc"></div>
    </div>
    <span class="border b1"></span>
    <span class="border b2"></span>
    <span class="border b3"></span>
    <span class="border b4"></span>
  </div>
  
</template>

<style scoped lang="scss">
.radio-intro {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  .intro-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
    .cover {
      width: 80px; height: 80px; border: 0.5Px solid rgba(0,0,0,0.12); overflow: hidden; background: rgba(0,0,0,0.04);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }
    .meta {
      display: flex; flex-direction: column; align-items: flex-start; min-width: 0;
      .title { font: 18Px SourceHanSansCN-Bold; color: black; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sub { margin-top: 6px; font: 12Px SourceHanSansCN-Bold; color: rgb(105,105,105); }
      .dot { margin: 0 6px; opacity: 0.6; }
    }
  }
  .intro-content { flex: 1; background: rgba(255,255,255,0.30); padding: 14Px; overflow: auto; }
  .status { font: 14px SourceHanSansCN-Bold; color: black; text-align: left; }
  .desc { font: 14px SourceHanSansCN-Bold; color: black; white-space: pre-wrap; text-align: left; line-height: 1.7; }
  .border { width: 1.5vh; height: 1.5vh; border: 1Px solid black; position: absolute; }
  .b1 { top: 6Px; left: 6Px; }
  .b2 { top: 6Px; right: 6Px; }
  .b3 { bottom: 6Px; right: 6Px; }
  .b4 { bottom: 6Px; left: 6Px; }
}
</style>

