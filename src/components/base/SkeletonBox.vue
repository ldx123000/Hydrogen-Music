<template>
  <div class="skeleton-box" :style="{ width, height, borderRadius }"></div>
</template>

<script setup>
defineProps({
  width: { type: String, default: '100%' },
  height: { type: String, default: '1em' },
  borderRadius: { type: String, default: '2px' },
})
</script>

<style scoped lang="scss">
.skeleton-box {
  background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.06) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

:global(html.dark) .skeleton-box {
  background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.06) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite;
}
</style>
