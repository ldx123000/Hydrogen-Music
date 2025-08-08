/**
 * BaseModal - 通用模态框组件
 * 替代重复的弹窗逻辑
 */

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div 
                v-if="show" 
                class="modal-overlay"
                @click="handleOverlayClick"
            >
                <div 
                    class="modal-container"
                    :class="modalClasses"
                    @click.stop
                >
                    <!-- Header -->
                    <div v-if="$slots.header || title || showClose" class="modal-header">
                        <div class="modal-title">
                            <slot name="header">
                                <h3 v-if="title">{{ title }}</h3>
                            </slot>
                        </div>
                        <button 
                            v-if="showClose"
                            class="modal-close"
                            @click="handleClose"
                            :disabled="loading"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <!-- Content -->
                    <div class="modal-body" :class="{ 'modal-body--loading': loading }">
                        <div v-if="loading" class="modal-loading">
                            <div class="spinner"></div>
                            <p v-if="loadingText">{{ loadingText }}</p>
                        </div>
                        <slot v-else />
                    </div>

                    <!-- Footer -->
                    <div v-if="$slots.footer" class="modal-footer">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
    show: {
        type: Boolean,
        required: true
    },
    title: {
        type: String,
        default: ''
    },
    size: {
        type: String,
        default: 'medium', // small, medium, large, full
        validator: (value) => ['small', 'medium', 'large', 'full'].includes(value)
    },
    showClose: {
        type: Boolean,
        default: true
    },
    closeOnOverlay: {
        type: Boolean,
        default: true
    },
    closeOnEscape: {
        type: Boolean,
        default: true
    },
    loading: {
        type: Boolean,
        default: false
    },
    loadingText: {
        type: String,
        default: '加载中...'
    },
    persistent: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['close', 'opened', 'closed'])

const modalClasses = computed(() => [
    'modal',
    `modal--${props.size}`,
    {
        'modal--persistent': props.persistent
    }
])

const handleClose = () => {
    if (!props.loading && !props.persistent) {
        emit('close')
    }
}

const handleOverlayClick = () => {
    if (props.closeOnOverlay) {
        handleClose()
    }
}

const handleEscape = (event) => {
    if (event.key === 'Escape' && props.closeOnEscape && props.show) {
        handleClose()
    }
}

// 监听 show 状态变化
watch(() => props.show, (newVal) => {
    if (newVal) {
        document.body.style.overflow = 'hidden'
        emit('opened')
    } else {
        document.body.style.overflow = ''
        emit('closed')
    }
})

onMounted(() => {
    document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
    document.removeEventListener('keydown', handleEscape)
    document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

.modal-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* Sizes */
.modal--small {
    width: 400px;
    max-width: 90vw;
}

.modal--medium {
    width: 600px;
    max-width: 90vw;
}

.modal--large {
    width: 800px;
    max-width: 95vw;
}

.modal--full {
    width: 95vw;
    height: 90vh;
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #f0f0f0;
}

.modal-title h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #333;
}

.modal-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #666;
    transition: color 0.2s ease;
    border-radius: 6px;
}

.modal-close:hover {
    color: #333;
    background: #f5f5f5;
}

.modal-close:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.modal-body {
    padding: 20px 24px;
    flex: 1;
    overflow-y: auto;
    position: relative;
}

.modal-body--loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
}

.modal-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.modal-loading p {
    margin: 0;
    color: #666;
    font-size: 14px;
}

.modal-footer {
    padding: 16px 24px 20px;
    border-top: 1px solid #f0f0f0;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #f0f0f0;
    border-top: 3px solid #007AFF;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* Transitions */
.modal-enter-active, .modal-leave-active {
    transition: opacity 0.3s ease;
}

.modal-enter-from, .modal-leave-to {
    opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
    transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
    transform: scale(0.9) translateY(-50px);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .modal-container {
        background: #1c1c1e;
        color: white;
    }
    
    .modal-header {
        border-bottom-color: #2c2c2e;
    }
    
    .modal-footer {
        border-top-color: #2c2c2e;
    }
    
    .modal-title h3 {
        color: white;
    }
    
    .modal-close {
        color: #a0a0a0;
    }
    
    .modal-close:hover {
        color: white;
        background: #2c2c2e;
    }
    
    .modal-loading p {
        color: #a0a0a0;
    }
}

/* Mobile responsive */
@media (max-width: 768px) {
    .modal-overlay {
        padding: 10px;
    }
    
    .modal--small,
    .modal--medium,
    .modal--large {
        width: 100%;
        max-width: none;
    }
    
    .modal-header,
    .modal-body,
    .modal-footer {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>