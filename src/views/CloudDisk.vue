<script setup>
  import { ref, onMounted, onUnmounted, computed } from 'vue'
  import { formatTime } from '../utils/time';
  import VueSlider from 'vue-slider-component'
  import { noticeOpen } from '../utils/dialog'
  import { getCloudDiskData, uploadCloudSong } from '../api/cloud'
  import CloudFileList from '../components/CloudFileList.vue'
  import { useUserStore } from '../store/userStore'
  import { useCloudStore } from '../store/cloudStore';
  import { storeToRefs } from 'pinia';
  const userStore = useUserStore()
  const cloudStore = useCloudStore()
  const { count, size, maxSize, cloudSongs } = storeToRefs(cloudStore)

  const isUploading = ref(false)
  const isDragOver = ref(false)
  const dragHasFiles = ref(false)
  const dragHasSupported = ref(false)
  const dragDetermined = ref(false)
  const uploadCloudDiskFile = ref()
  let changeHandler = null

  onMounted(() => {
    typeChange(1)
    changeHandler = async (e) => {
      const input = uploadCloudDiskFile.value
      if (!input) return
      const files = Array.from(input.files || [])
      if (!files.length) return
      await uploadFilesSequentially(files)
      // 清理 input 的值，释放文件引用并允许选择相同文件再次上传
      try { input.value = '' } catch (_) {}
      // 上传完成后刷新云盘信息
      typeChange(1)
    }
    uploadCloudDiskFile.value.addEventListener('change', changeHandler)
  })

  onUnmounted(() => {
    if (uploadCloudDiskFile.value && changeHandler) {
      try { uploadCloudDiskFile.value.removeEventListener('change', changeHandler) } catch (_) {}
    }
  })

  const typeSelect = ref(1)

  function typeChange(num) {
    typeSelect.value = num
    if(num == 1) {
      let params = {
        limit: 500,
        offset: 0,
        timestamp: new Date().getTime(),
      }
      getCloudDiskData(params).then(result => {
        count.value = result.count
        // 确保为数字，避免字符串进入 v-model
        size.value = Number((result.size / 1024 / 1024 / 1024).toFixed(1))
        maxSize.value = Number(result.maxSize / 1024 / 1024 / 1024)
        cloudSongs.value = result.data
      })
    }
  }
  const uploadFile = () => {
    uploadCloudDiskFile.value.click()
  }
  const supportedExt = new Set(['mp3','aac','wma','wav','ogg','m4a','ape','flac','cue'])
  const extractExt = (name) => (name?.split('.').pop() || '').toLowerCase()
  const analyzeDragItems = (dt) => {
    const types = Array.from(dt?.types || [])
    const isFiles = types.includes('Files')
    dragHasFiles.value = isFiles
    let hasKnownSupported = false
    let hasKnownUnsupported = false
    let sawUnknown = false
    if (isFiles) {
      const items = Array.from(dt?.items || [])
      if (items.length) {
        for (const it of items) {
          if (it.kind !== 'file') continue
          const mime = it.type || ''
          if (mime) {
            if (mime.startsWith('audio/')) { hasKnownSupported = true; continue }
            // 若提供了类型且非音频，视为已知不支持
            hasKnownUnsupported = true
            continue
          }
          try {
            const f = it.getAsFile?.()
            if (f && f.name) {
              const ext = extractExt(f.name)
              if (supportedExt.has(ext)) hasKnownSupported = true
              else hasKnownUnsupported = true
            } else {
              sawUnknown = true
            }
          } catch (_) {
            sawUnknown = true
          }
        }
      } else {
        // 无法获取 items 时保持未知，避免误判
        sawUnknown = true
      }
    }
    if (hasKnownSupported) {
      dragHasSupported.value = true
      dragDetermined.value = true
    } else if (hasKnownUnsupported && !sawUnknown) {
      dragHasSupported.value = false
      dragDetermined.value = true
    } else {
      dragHasSupported.value = true // 未知时偏向正向提示
      dragDetermined.value = false
    }
  }
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    analyzeDragItems(e.dataTransfer)
    isDragOver.value = dragHasFiles.value && !isUploading.value
  }
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    analyzeDragItems(e.dataTransfer)
    isDragOver.value = dragHasFiles.value && !isUploading.value
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' } catch (_) {}
  }
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragOver.value = false
  }
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragOver.value = false
    if (isUploading.value) {
      noticeOpen('正在上传，请稍后再试', 2)
      return
    }
    const list = Array.from(e.dataTransfer?.files || [])
    const files = list.filter(f => supportedExt.has(extractExt(f.name)))
    if (!files.length) {
      noticeOpen('未检测到支持的音频文件', 2)
      return
    }
    await uploadFilesSequentially(files)
    // 上传完成后刷新云盘信息
    typeChange(1)
  }
  const dropOverlayTitle = computed(() => (dragDetermined.value && !dragHasSupported.value) ? 'UNSUPPORTED' : 'DROP TO UPLOAD')
  const dropOverlaySub = computed(() => (dragDetermined.value && !dragHasSupported.value) ? '不支持的文件类型' : '释放文件开始上传')
  async function uploadSingle(file) {
    const formData = new FormData()
    formData.append('songFile', file)
    const res = await uploadCloudSong(formData)
    if (res && res.code === 200) return res
    // axios拦截器会在错误时返回对象而非抛出异常，这里统一当做失败处理
    throw new Error(res?.msg || res?.message || '上传失败')
  }

  async function uploadFilesSequentially(files) {
    isUploading.value = true
    try {
      const maxRetries = 3
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        let attempt = 0
        while (attempt < maxRetries) {
          try {
            await uploadSingle(file)
            noticeOpen(`${file.name} 上传成功`, 2)
            break
          } catch (err) {
            attempt += 1
            if (attempt >= maxRetries) {
              noticeOpen(`上传失败：${file.name}`, 3)
            } else {
              noticeOpen(`${file.name} 失败 ${attempt} 次，重试中...`, 3)
              // 线性退避，避免请求风暴
              await new Promise(r => setTimeout(r, 800 * attempt))
            }
          }
        }
      }
      noticeOpen('上传完毕', 2)
    } finally {
      isUploading.value = false
    }
  }
  const addTime =(time) => {
    return formatTime(time, "YYYY-MM-DD HH:mm:ss")
  }
</script>

<template>
  <div class="cloud-disk" v-if=userStore.cloudDiskPage>
    <div class="disk-left">
      <div class="disk-title">
        <div class="title-tip"></div>
        <div class="title-name">我的云盘</div>
      </div>
      <div class="disk-tab">
        <div class="file-type">
          <div class="type" @click="typeChange(1)">
            <div class="type-icon">
              <svg t="1668958966841" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1994" width="200" height="200"><path d="M65 302.433l0 568.135 894 0L959 302.433 65 302.433zM929.2 840.768 94.8 840.768 94.8 332.232l834.4 0L929.2 840.768z" p-id="1995"></path><path d="M154.4 227.933l715.199 0 0 29.8-715.199 0 0-29.8Z" p-id="1996"></path><path d="M258.7 153.433l506.6 0 0 29.8-506.6 0 0-29.8Z" p-id="1997"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 1}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">全部</div>
          </div>
          <div class="type" @click="typeChange(2)">
            <div class="type-icon">
              <svg t="1668958852865" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="27462" width="200" height="200"><path d="M271.738 465.729c56.472 0 102.438-46.461 102.438-103.514 0-57.083-45.966-103.515-102.438-103.515S169.3 305.132 169.3 362.215C169.3 419.268 215.266 465.729 271.738 465.729zM271.738 288.5c40.058 0 72.637 33.074 72.637 73.715 0 40.654-32.579 73.714-72.637 73.714-40.059 0-72.638-33.06-72.638-73.714C199.1 321.574 231.679 288.5 271.738 288.5z" p-id="27463"></path><path d="M65 154.4 65 869.6l894 0L959 154.4 65 154.4zM929.2 839.8 123.582 839.8l288.76-244.322L560.57 724.965 929.2 430.355 929.2 839.8zM929.2 392.218 561.414 686.144 412.662 556.176 94.8 825.118 94.8 184.2l834.4 0L929.2 392.218z" p-id="27464"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 2}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">图片</div>
          </div>
          <div class="type" @click="typeChange(3)">
            <div class="type-icon">
              <svg t="1668958888752" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1683" width="200" height="200"><path d="M929.2 94.8 363 94.8l-29.8 0 0 29.8 0 566.476c-27.181-36.289-70.382-59.877-119.2-59.877-82.285 0-149 66.717-149 149 0 82.285 66.715 149 149 149s149-66.715 149-149L363 124.6l566.2 0 0 491.976c-27.181-36.289-70.382-59.877-119.2-59.877-82.284 0-149 66.717-149 149 0 82.285 66.716 149 149 149 82.285 0 149-66.715 149-149L959 94.8 929.2 94.8zM214 899.4c-65.726 0-119.2-53.475-119.2-119.201C94.8 714.475 148.274 661 214 661c65.726 0 119.2 53.475 119.2 119.199C333.2 845.926 279.726 899.4 214 899.4zM810 824.9c-65.726 0-119.199-53.475-119.199-119.201 0-65.725 53.474-119.199 119.199-119.199s119.2 53.475 119.2 119.199C929.2 771.426 875.726 824.9 810 824.9z" p-id="1684"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 3}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">音乐</div>
          </div>
          <div class="type" @click="typeChange(4)">
            <div class="type-icon">
              <svg t="1668959020587" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2459" width="200" height="200"><path d="M512 65C265.146 65 65 265.146 65 512c0 246.839 200.146 447 447 447 246.869 0 447-200.161 447-447C959 265.146 758.869 65 512 65zM512 929.199C281.952 929.199 94.8 742.048 94.8 512S281.952 94.8 512 94.8 929.2 281.952 929.2 512 742.048 929.199 512 929.199z" p-id="2460"></path><path d="M426.15 720.6 717.05 511.985 426.15 303.399 426.15 720.6zM455.951 361.443l209.967 150.542L455.951 662.557 455.951 361.443z" p-id="2461"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 4}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">视频</div>
          </div>
          <div class="type" @click="typeChange(5)">
            <div class="type-icon">
              <svg t="1668959105131" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="34145" width="200" height="200"><path d="M561.548387 578.064516h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0-66.064516h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 132.129032h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 66.064516h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 132.129033h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0-396.387097h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 330.322581h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m99.096774-363.354839h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m-99.096774-33.032258h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m99.096774 99.096774h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m198.193549-462.451613h-201.496775c-3.303226 0-9.909677-3.303226-13.212903 0H429.419355c-3.303226 0-6.606452 0-6.606452 3.303226h-6.606451l-264.258065 264.258064v6.606452c-3.303226 0-3.303226 3.303226-3.303226 6.606452v693.677419c0 9.909677 6.606452 16.516129 16.516129 16.516129h693.67742c9.909677 0 16.516129-6.606452 16.516129-16.516129V33.032258c0-9.909677-6.606452-16.516129-16.516129-16.516129z m-317.109678 33.032258H644.129032l33.032258 66.064516-26.425806 42.941936-19.819355-62.761291c-3.303226-9.909677-9.909677-13.212903-16.516129-13.212903h-33.032258c-6.606452 0-13.212903 3.303226-16.516129 13.212903l-19.819355 66.064517-26.425806-46.245162 23.12258-66.064516z m89.187097 254.348387c-13.212903 13.212903-62.76129 13.212903-75.974194 0-9.909677-9.909677-13.212903-26.425806-6.606451-39.638709l42.941935-148.645162h6.606452L640.825806 264.258065c3.303226 13.212903 0 29.729032-9.909677 39.638709zM412.903226 72.670968v208.103226H204.8L412.903226 72.670968z m429.419355 901.780645H181.677419v-660.645161h247.741936c9.909677 0 16.516129-6.606452 16.516129-16.516129V49.548387h56.154839L478.967742 109.006452c0 6.606452 0 9.909677 3.303226 16.516129l46.245161 79.277419-13.212903 49.548387c-9.909677 23.122581-3.303226 52.851613 16.516129 72.670968 13.212903 13.212903 36.335484 19.819355 62.76129 19.819355s49.548387-6.606452 62.76129-19.819355c19.819355-19.819355 26.425806-49.548387 16.51613-72.670968l-13.212904-49.548387L710.193548 122.219355c3.303226-6.606452 3.303226-9.909677 0-16.516129l-29.729032-56.154839H842.322581v924.903226z m-181.67742-429.419355h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 198.193548h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.51613h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.51613s-6.606452-16.516129-16.516129-16.516129z m0-132.129032h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0 198.193549h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z m0-132.129033h-33.032258c-9.909677 0-16.516129 6.606452-16.516129 16.516129s6.606452 16.516129 16.516129 16.516129h33.032258c9.909677 0 16.516129-6.606452 16.516129-16.516129s-6.606452-16.516129-16.516129-16.516129z" fill="" p-id="34146"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 5}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">压缩包</div>
          </div>
          <div class="type" @click="typeChange(6)">
            <div class="type-icon">
              <svg t="1668958919657" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1837" width="200" height="200"><path d="M251.25 452.4l521.5 0 0 29.8-521.5 0 0-29.8Z" p-id="1838"></path><path d="M251.25 616.301l521.5 0 0 29.8-521.5 0 0-29.8Z" p-id="1839"></path><path d="M251.25 780.2l253.3 0 0 29.801-253.3 0 0-29.801Z" p-id="1840"></path><path d="M884.457 301.407l0-0.189-0.189 0L649.214 65.204 649.214 65l-29.8 0L610 65 139.5 65l0 894 744.957 0L884.457 340.592l0-39.068 0.043-0.059L884.457 301.407zM649.214 107.445l195.155 195.94-195.155-0.015L649.214 107.445zM854.656 929.2 169.3 929.2 169.3 94.8l450.114 0 0 208.571L619.414 318.3l0 14.9 235.242-0.015L854.656 929.2z" p-id="1841"></path></svg>
              <svg class="type-select" :class="{'type-selected': typeSelect == 6}" preserveAspectRatio="none meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="250" height="200" viewBox="0 0 250 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="250" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 125 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 -13)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 156)  rotate(0 0.0005 21.999388921274445)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(247 0)  rotate(0 0.0005 22)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(247 0)  rotate(0 0.0005 22)" d="M0,0L0,44 "/><path id="line" style="fill:#CCCCCC" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(3 156)  rotate(0 0.0005 28.49938892127444)" d="M0,0L0,57 "/><path id="line" style="fill:#CCCCCC" transform="translate(0 3)  rotate(0 22 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 3)  rotate(0 22 0.0005)" d="M0,0L44,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 197)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(-52 197)  rotate(0 53.25 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-52 197)  rotate(0 53.25 0.0005)" d="M0,0L106.5,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:6; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(205 3)  rotate(0 22.250611083111608 0.0005)" d="M0,0L44.5,0 "/></g></g></svg>
            </div>
            <div class="type-name">文档</div>
          </div>
        </div>
        <div class="disk-info" v-if="cloudSongs">
          <div class="info-container">
          <div class="info-title">云盘信息</div>
            <div class="info-list">
              <div class="info-item">
                <div class="item-lable">当前用户</div>
                <div class="item-info">{{userStore.user.nickname}}</div>
              </div>
              <div class="info-item">
                <div class="item-lable">云盘容量</div>
                <div class="disk-capacity">
                  <div class="capacity">
                    <vue-slider id="widget-progress" class="cloud-capacity"  v-model="size" :min="0" :max="maxSize" :interval="0.1" :duration="0.5" tooltip="none" :clickable="false" :disabled="true"></vue-slider>
                  </div>
                  <div class="capacity-num">{{ size }}G / {{ maxSize }}G</div>
                </div>
              </div>
              <div class="info-item">
                <div class="item-lable">文件数量</div>
                <div class="item-info">{{count}} 个</div>
              </div>
              <div class="info-item">
                <div class="item-lable">上次添加</div>
                <div class="item-info" v-if=cloudSongs[0]>{{addTime(cloudSongs[0].addTime)}}</div>
                <div class="item-info" v-else>NONE</div>
              </div>
            </div>
            <div class="info-footer">
              <div class="footer-line"></div>
              <div class="footer-title">MUSCICLOUD INFO</div>
            </div>
          </div>
        </div>
        <svg class="tab-back1" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2927" width="200" height="200"><path d="M513.024 65.536q93.184 0 175.616 35.84t143.872 97.28 97.28 143.872 35.84 175.616q0 94.208-35.84 176.64t-97.28 143.872-143.872 97.28-175.616 35.84q-94.208 0-176.64-35.84t-143.872-97.28-97.28-143.872-35.84-176.64q0-93.184 35.84-175.616t97.28-143.872 143.872-97.28 176.64-35.84zM513.024 909.312q80.896 0 152.064-30.72t124.416-83.968 83.968-124.416 30.72-152.064-30.72-152.064-83.968-124.416-124.416-83.968-152.064-30.72q-81.92 0-153.088 30.72t-124.416 83.968-83.968 124.416-30.72 152.064 30.72 152.064 83.968 124.416 124.416 83.968 153.088 30.72zM513.024 190.464q66.56 0 124.928 25.088t102.4 69.12 69.12 102.4 25.088 124.928-25.088 125.44-69.12 102.912-102.4 69.12-124.928 25.088-125.44-25.088-102.912-69.12-69.12-102.912-25.088-125.44 25.088-124.928 69.12-102.4 102.912-69.12 125.44-25.088z" p-id="2928" fill="#ffffff"></path></svg>
        <div class="tab-back2">INFO</div>
      </div>
      <div
        class="disk-upload"
        :class="{ dragover: isDragOver }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <Transition name="upload-fade">
          <div class="upload" @click.stop="uploadFile()" v-show="!isUploading">
            <div class="upload-icon">
              <svg class="icon1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#CCCCCC" transform="translate(40 2)  rotate(0 59.25 10.250001233827362)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(40 2)  rotate(0 59.25 10.250001233827362)" d="M118.5,20.5C118.5,20.5 111.03,13.56 94.5,7C84.25,2.93 69.03,0 58.5,0C47.81,0 33.92,2.66 23,7C5.82,13.83 0,20.5 0,20.5 "/><path id="line" style="fill:#CCCCCC" transform="translate(40 177)  rotate(180 59.25 10.250001233827362)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(40 177)  rotate(180 59.25 10.250001233827362)" d="M118.5,20.5C118.5,20.5 111.03,13.56 94.5,7C84.25,2.93 69.03,0 58.5,0C47.81,0 33.92,2.66 23,7C5.82,13.83 0,20.5 0,20.5 "/><path id="line" style="fill:#CCCCCC" transform="translate(180 45)  rotate(0 8.500000001232923 54.5)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(180 45)  rotate(0 8.500000001232923 54.5)" d="M0.5,109C0.5,109 7.13,98.81 12.23,83.88C15.42,74.56 17,64.17 17,55C17,45.85 15.5,35.47 12.41,26.16C7.46,11.21 0,0 0,0 "/><path id="line" style="fill:#CCCCCC" transform="translate(2 45)  rotate(180 8.500000001232923 54.5)" opacity="1" d=""/><path id="line" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(2 45)  rotate(180 8.500000001232923 54.5)" d="M0.5,109C0.5,109 7.13,98.81 12.23,83.88C15.42,74.56 17,64.17 17,55C17,45.85 15.5,35.47 12.41,26.16C7.46,11.21 0,0 0,0 "/></g></g></svg>
              <svg t="1669024202738" class="icon2" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3015" width="200" height="200"><path d="M533.333333 104.533333V917.333333c0 10.666667-8.533333 19.2-19.2 19.2H512c-10.666667 0-19.2-8.533333-19.2-19.2V104.533333c-2.133333-10.666667 6.4-19.2 17.066667-19.2h2.133333c12.8 0 21.333333 8.533333 21.333333 19.2z" p-id="3016"></path><path d="M526.933333 121.6L253.866667 394.666667c-8.533333 8.533333-21.333333 8.533333-27.733334 0l-2.133333-2.133334c-8.533333-8.533333-8.533333-21.333333 0-27.733333L497.066667 91.733333c8.533333-8.533333 21.333333-8.533333 27.733333 0l2.133333 2.133334c8.533333 6.4 8.533333 19.2 0 27.733333z" p-id="3017"></path><path d="M497.066667 121.6l273.066666 273.066667c8.533333 8.533333 21.333333 8.533333 27.733334 0l2.133333-2.133334c8.533333-8.533333 8.533333-21.333333 0-27.733333L526.933333 91.733333c-8.533333-8.533333-21.333333-8.533333-27.733333 0l-2.133333 2.133334c-8.533333 6.4-8.533333 19.2 0 27.733333z" p-id="3018"></path></svg>
            </div>
            <div class="upload-title">上传</div>
            <input ref="uploadCloudDiskFile" style="display: none;" type="file" accept=".mp3,.aac,.wma,.wav,.ogg,.m4a,.ape,.flac,.cue" multiple />
          </div>
        </Transition>
        <Transition name="upload-fade">
          <div class="upload-animation" v-show="isUploading">
            <span class="uploading-title">上传中...</span>
            <span class="uploading-subtitle">上传完成后可能需要转码，请稍后刷新查看</span>
            <div class="animation"></div>
          </div>
        </Transition>
        <!-- Drag-and-drop overlay -->
        <div class="drop-overlay" :class="{ unsupported: dragDetermined && !dragHasSupported }" v-show="isDragOver">
          <div class="overlay-inner">
            <div class="overlay-title">{{ dropOverlayTitle }}</div>
            <div class="overlay-sub">{{ dropOverlaySub }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="disk-right">
      <CloudFileList></CloudFileList>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .cloud-disk{
    width: 100%;
    height: calc(100% - 110Px);
    display: flex;
    flex-direction: row;
    .disk-left{
      width: 55%;
      max-width: 450Px;
      height: 100%;
      .disk-title{
        margin-bottom: 5Px;
        display: flex;
        flex-direction: row;
        align-items: center;
        .title-tip{
          margin-right: 5Px;
          width: 6Px;
          height: 6Px;
          background-color: black;
        }
        .title-name{
          font: 16Px SourceHanSansCN-Bold;
          text-align: left;
          color: black;
          display: flex;
          flex-direction: row;
        }
      }
      .disk-tab{
        height: calc(78% - 29Px);
        background-color: rgba(255, 255, 255, 0.30);
        position: relative;
        .file-type{
          height: 55%;
          padding: 22Px 12Px 10Px 10Px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          align-content: space-evenly;
          .type{
            transition: 0.2s;
            &:hover{
              cursor: pointer;
            }
            .type-icon{
              display: flex;
              justify-content: center;
              position: relative;
              .icon{
                width: 35Px;
                height: 35Px;
              }
              .type-select{
                width: 60Px;
                height: 45Px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%,-50%);
                opacity: 0;
              }
              .type-selected{
                animation: type-selected 0.35s ease-out forwards;
              }
              @keyframes type-selected {
                0%{width: 75Px;height: 60Px;}
                40%{width: 65Px;height: 45Px;opacity: 0.8;}
                60%{width: 65Px;height: 45Px;opacity: 0.8;}
                100%{width: 55Px;height: 45Px;opacity: 0.8;}
              }
            }
            .type-name{
              margin-top: 10Px;
              font: 12Px SourceHanSanSCN-Bold;
              color: black;
            }
          }
        }
        .disk-info{
          padding: 10Px;
          height: 45%;
          .info-container{
            width: 100%;
            height: 100%;
            padding: 5Px 7Px;
            background-color: rgba(255, 255, 255, 0.5);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            .info-title{
              font: 9Px SourceHanSansCN-Bold;
              text-align: left;
              color: rgba(255, 255, 255, 0.9);
              background-color: black;
              padding: 1Px 4Px;
            }
            .info-list{
              height: 100%;
              padding: 0 4Px;
              display: flex;
              flex-direction: column;
              justify-content: space-evenly;
              .info-item{
                display: flex;
                flex-direction: row;
                align-items: center;
                .item-lable{
                  margin-right: 6Px;
                  font: 12Px SourceHanSansCN-Bold;
                  color: black;
                  white-space: nowrap;
                }
                .item-info{
                  font: 10Px SourceHanSansCN-Bold;
                  color: black;
                }
                .disk-capacity{
                  width: 100%;
                  display: flex;
                  align-items: center;
                  .capacity{
                    margin-right: 6Px;
                    width: 100%;
                    position: relative;
                    .cloud-capacity{
                      height: 7Px !important;
                      box-shadow: 0 0 0 0.5Px black !important;
                      pointer-events: none;
                    }
                  }
                  .capacity-num{
                    text-align: left;
                    white-space: nowrap;
                    font: 9Px SourceHanSansCN-Bold;
                    color: black;
                  }
                }
              }
            }
            .info-footer{
              .footer-line{
                height: 0.5Px;
                background-color: black;
              }
              .footer-title{
                font: 9Px Source Han Sans;
                color: rgb(181, 181, 181);
                text-align: right;
              }
            }
          }
        }
        .tab-back1{
          width: 16Px;
          height: 16Px;
          position: absolute;
          top: 10Px;
          left: 10Px;
          opacity: 0.6;
        }
        .tab-back2{
          font: 38Px SourceHanSansCN-Bold;
          color: white;
          position: absolute;
          top: 0;
          right: 10px;
          opacity: 0.2;
          pointer-events: none;
        }
      }
      .disk-upload{
        margin-top: 10Px;
        width: 100%;
        height: calc(22% - 10Px);
        background-color: rgba(255, 255, 255, 0.30);
        position: relative;
        transition: 0.2s;
        &:hover{
          cursor: pointer;
          background-color: rgba(255, 255, 255, 0.50);
        }
        &.dragover{
          background-color: rgba(255, 255, 255, 0.55);
          outline: 1Px dashed black;
          outline-offset: -6Px;
          .upload{ opacity: 0; }
        }
        &:active{
          background-color: rgba(255, 255, 255, 0.30);
        }
        .upload{
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          position: absolute;
          .upload-icon{
            margin-right: 12Px;
            width: 45Px;
            height: 45Px;
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            .icon1{
              width: 100%;
              height: 100%;
              opacity: 0.7;
              position: absolute;
              animation: upload-icon 12s linear infinite;
            }
            .icon2{
              width: 70%;
              height: 70%;
              position: absolute;
            }
            @keyframes upload-icon {
              0%{transform: rotate(0);}
              100%{transform: rotate(360deg);}
            }
          }
          .upload-title{
            font: 20Px Sours Han Sans;
            color: rgb(130, 130, 130);
            font-weight: lighter;
          }
        }
        $uploadColor: rgb(255, 255, 255, 0.1);
        .upload-animation{
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: absolute;
          overflow: hidden;
          pointer-events: none;
          background: linear-gradient(135deg, #0000 25%, $uploadColor 0, $uploadColor 50%, #0000 0, #0000 75%, $uploadColor 0);
          background-size: 15px 15px;
          animation: upload-background 20s linear infinite;
          @keyframes upload-background {
            0%{background-position: 0%;}
            100%{background-position: 100%;}
          }
          .uploading-title{
            font: 20Px Sours Han Sans;
            color: rgb(130, 130, 130);
            font-weight: lighter;
          }
          .uploading-subtitle{
            font: 12Px Sours Han Sans;
            color: rgb(130, 130, 130);
            font-weight: lighter;
          }
          .animation{
            width: 10%;
            height: 1Px;
            background-color: black;
            position: absolute;
            top: 0;
            left: 10%;
            animation: upload-animation 3s infinite;
            transform: rotate(180deg);
            @keyframes upload-animation {
              0%{width: 0%;left: 120%;}
              40%{width: 150%;left: 120%;}
              65%{width: 0%;left: -30%;}
              85%{width: 60%;}
              100%{width: 0%;left: 120%;}
            }
          }
        }
        .drop-overlay{
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0000 25%, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 50%, #0000 0, #0000 75%, rgba(255,255,255,0.12) 0);
          background-size: 14px 14px;
          animation: drop-overlay-bg 12s linear infinite;
          @keyframes drop-overlay-bg {
            0%{background-position: 0%}
            100%{background-position: 100%}
          }
          .overlay-inner{
            text-align: center;
            transform: translateY(-2px);
          }
          .overlay-icon{
            width: 44Px;
            height: 44Px;
            margin: 0 auto 8Px auto;
            position: relative;
            .ring{ width: 100%; height: 100%; opacity: .6; }
            .arrow{ position: absolute; top: 14%; left: 14%; width: 72%; height: 72%; }
          }
          .overlay-title{
            font: 18Px SourceHanSansCN-Bold;
            letter-spacing: 1Px;
            color: black;
          }
          .overlay-sub{
            margin-top: 2Px;
            font: 11Px SourceHanSansCN-Bold;
            color: rgba(0,0,0,.75);
          }
          &.unsupported{
            outline: 1Px dashed black;
            outline-offset: -6Px;
            .overlay-title{ color: #9a2a2a; }
            .overlay-sub{ color: #9a2a2a; opacity: 0.85; }
          }
        }
      }
    }
    .disk-right{
      margin-top: 29Px;
      margin-left: 50Px;
      width: 100%;
      height: calc(100% - 29Px);
    }
  }
  .upload-fade-enter-active,
  .upload-fade-leave-active {
    transition: 0.3s cubic-bezier(.14,.91,.58,1);
  }

  .upload-fade-enter-from,
  .upload-fade-leave-to {
    transform: scale(0.9);
    opacity: 0;
  }
</style>
