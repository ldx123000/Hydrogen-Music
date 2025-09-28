<template>
    <div class="global-dialog" v-show="visible"></div>
    <Transition name="dialog-fade" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
        <div class="dialog-container" :class="{'dialog-container-active': isActive}" v-if="visible">
            <div class="dialog">
                <div class="dialog-header">
                    <span class="header-title">{{ title }}</span>
                </div>
                <div class="dialog-content">
                    <!-- 检查更新中 -->
                    <div v-if="updateStatus === 'checking'" class="update-content">
                        <span class="content-text">正在检查更新...</span>
                        <div class="spinner"></div>
                    </div>
                    
                    <!-- 发现新版本 -->
                    <div v-else-if="updateStatus === 'available'" class="update-content">
                        <span class="content-text">发现新版本 v{{ newVersion }}</span>
                    </div>
                    
                    <!-- 下载中 -->
                    <div v-else-if="updateStatus === 'downloading'" class="update-content">
                        <span class="content-text">正在下载更新 {{ downloadProgress }}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" :style="{ width: downloadProgress + '%' }"></div>
                        </div>
                    </div>
                    
                    <!-- 准备安装 -->
                    <div v-else-if="updateStatus === 'ready'" class="update-content">
                        <span class="content-text">更新已下载完成，重启应用以应用更新</span>
                    </div>
                    
                    <!-- 已是最新版本 -->
                    <div v-else-if="updateStatus === 'latest'" class="update-content">
                        <span class="content-text">当前版本已是最新版本</span>
                    </div>
                    
                    <!-- 更新错误 -->
                    <div v-else-if="updateStatus === 'error'" class="update-content">
                        <span class="content-text">更新失败：{{ errorMessage }}</span>
                    </div>
                </div>
                <div class="dialog-option">
                    <!-- 发现新版本的按钮 -->
                    <template v-if="updateStatus === 'available'">
                        <div class="option-cancel" @click="closeDialog">稍后提醒</div>
                        <div class="option-confirm" @click="startDownload" :class="{ disabled: isDownloading }">
                            {{ isDownloading ? '下载中...' : (manualDownloadUrl ? '前往下载' : '立即更新') }}
                        </div>
                    </template>
                    
                    <!-- 下载中的按钮 -->
                    <template v-else-if="updateStatus === 'downloading'">
                        <div class="option-confirm single" @click="cancelDownload">取消下载</div>
                    </template>
                    
                    <!-- 准备安装的按钮 -->
                    <template v-else-if="updateStatus === 'ready'">
                        <div class="option-cancel" @click="closeDialog">稍后重启</div>
                        <div class="option-confirm" @click="installUpdate">立即重启</div>
                    </template>
                    
                    <!-- 错误状态的按钮 -->
                    <template v-else-if="updateStatus === 'error'">
                        <div class="option-cancel" @click="closeDialog">取消</div>
                        <div class="option-confirm" @click="retryUpdate">重试</div>
                    </template>
                    
                    <!-- 其他状态的单个确定按钮 -->
                    <template v-else>
                        <div class="option-confirm single" @click="closeDialog">确定</div>
                    </template>
                </div>
            </div>
            <span class="dialog-style dialog-style1"></span>
            <span class="dialog-style dialog-style2"></span>
            <span class="dialog-style dialog-style3"></span>
            <span class="dialog-style dialog-style4"></span>
        </div>
    </Transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
    visible: {
        type: Boolean,
        default: false
    },
    newVersion: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['close', 'download', 'install', 'cancel', 'retry'])

const updateStatus = ref('checking') // checking, available, downloading, ready, latest, error
const downloadProgress = ref(0)
const isDownloading = ref(false)
// 若为 mac 手动更新流程，这里存 GitHub Release 页链接
const manualDownloadUrl = ref('')
const errorMessage = ref('')
const isActive = ref(false)

const title = computed(() => {
    switch (updateStatus.value) {
        case 'checking': return '检查更新'
        case 'available': return '发现新版本'
        case 'downloading': return '下载更新'
        case 'ready': return '准备安装'
        case 'latest': return '当前已是最新'
        case 'error': return '更新失败'
        default: return '应用更新'
    }
})

const onAfterEnter = () => isActive.value = true
const onAfterLeave = () => isActive.value = false

const closeDialog = () => {
    if (updateStatus.value === 'downloading') return
    emit('close')
}

const startDownload = () => {
    // mac 手动更新：跳转到下载页
    if (manualDownloadUrl.value) {
        try { windowApi?.toRegister?.(manualDownloadUrl.value) } catch (_) {}
        emit('close')
        return
    }
    updateStatus.value = 'downloading'
    isDownloading.value = true
    emit('download')
}

const cancelDownload = () => {
    updateStatus.value = 'available'
    isDownloading.value = false
    downloadProgress.value = 0
    emit('cancel')
}

const installUpdate = () => {
    emit('install')
}

const retryUpdate = () => {
    updateStatus.value = 'checking'
    errorMessage.value = ''
    emit('retry')
}

// 监听更新事件
const setupUpdateListeners = () => {
    if (typeof windowApi !== 'undefined') {
        // 手动更新检查结果（用于设置页面的手动检查）
        windowApi.manualUpdateAvailable((version, url) => {
            updateStatus.value = 'available'
            if (url) manualDownloadUrl.value = url
        })
        
        // 更新不可用
        windowApi.updateNotAvailable(() => {
            updateStatus.value = 'latest'
        })
        
        // 下载进度
        windowApi.updateDownloadProgress((progress) => {
            downloadProgress.value = progress
        })
        
        // 下载完成
        windowApi.updateDownloaded(() => {
            updateStatus.value = 'ready'
            isDownloading.value = false
        })
        
        // 更新错误
        windowApi.updateError((error) => {
            updateStatus.value = 'error'
            errorMessage.value = error
            isDownloading.value = false
        })
    }
}

onMounted(() => {
    setupUpdateListeners()
})
</script>

<style scoped lang="scss">
.global-dialog{
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
    background-color: rgba(0, 0, 0, 0.1);
    z-index: 999;
}

.dialog-container{
    z-index: 1000;
    width: 0;
    height: 0;
    background-image: url('../assets/img/halftone.png');
    background-size: 40%;
    background-repeat: repeat;
    background-color: rgb(14, 14, 14);
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    &-active {
        width: 320px;
        height: 180px;
        padding: 15px 20px;
    }
    
    .dialog{
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        overflow: hidden;
        
        .dialog-header{
            .header-title{
                font: 16px SourceHanSansCN-Bold;
                color: rgba(255, 255, 255, 0.95);
            }
        }
        
        .dialog-content{
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            
            .update-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                
                .content-text{
                    font: 14px SourceHanSansCN-Bold;
                    color: rgba(255, 255, 255, 0.9);
                    text-align: center;
                    line-height: 1.4;
                }
            }
        }
        
        .dialog-option{
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            
            .option-cancel{
                margin-right: 20px;
            }
            
            .option-cancel, .option-confirm{
                width: 75px;
                height: 28px;
                border: 0.5px solid rgba(255, 255, 255, 0.9);
                font: 14px SourceHanSansCN-Bold;
                color: rgba(255, 255, 255, 0.9);
                line-height: 27px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
                
                &:hover:not(.disabled){
                    background-color: rgba(255, 255, 255, 0.9);
                    color: black;
                }
                
                &.single {
                    margin-right: 0;
                }
                
                &.disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }
        }
    }
    
    .dialog-style{
        width: 9px;
        height: 9px;
        background-color: rgb(247, 247, 247);
        position: absolute;
        opacity: 0;
        animation: dialog-style-in 0.4s forwards;
        
        @keyframes dialog-style-in {
            0%{opacity: 0;}
            10%{opacity: 1;}
            20%{opacity: 0;}
            30%{opacity: 1;}
            40%{opacity: 0;}
            50%{opacity: 1;}
            60%{opacity: 0;}
            70%{opacity: 1;}
            80%{opacity: 0;}
            90%{opacity: 0;}
            100%{opacity: 1;}
        }
    }
    
    $position: -4px;
    .dialog-style1{
        top: $position;
        left: $position;
    }
    .dialog-style2{
        top: $position;
        right: $position;
    }
    .dialog-style3{
        bottom: $position;
        right: $position;
    }
    .dialog-style4{
        bottom: $position;
        left: $position;
    }
}

.progress-bar {
    width: 200px;
    height: 6px;
    background-color: rgba(255, 255, 255, 0.2);
    border: 0.5px solid rgba(255, 255, 255, 0.4);
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background-color: rgba(255, 255, 255, 0.8);
    transition: width 0.3s ease;
}

.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>

<style lang="scss">
.dialog-fade-enter-active {
    animation: dialog-container-in 0.4s 0.15s forwards;
}
.dialog-fade-leave-active {
    animation: dialog-container-in 0.4s reverse;
}

@keyframes dialog-container-in {
    0%{width: 0;height: 0;padding: 0;}
    50%{width: 320px;height: 0;padding: 0;}
    100%{width: 320px;height: 180px;padding: 15px 20px;}
}
</style>
