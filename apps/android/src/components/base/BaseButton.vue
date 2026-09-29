/**
 * BaseButton - 通用按钮组件
 * 替代重复的按钮逻辑
 */

<template>
    <button 
        :class="buttonClasses"
        :disabled="disabled || loading"
        @click="handleClick"
        :type="type"
    >
        <div v-if="loading" class="button-loading">
            <div class="spinner"></div>
        </div>
        <template v-else>
            <slot name="icon" />
            <span v-if="$slots.default" class="button-text">
                <slot />
            </span>
        </template>
    </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    variant: {
        type: String,
        default: 'primary', // primary, secondary, ghost, danger
        validator: (value) => ['primary', 'secondary', 'ghost', 'danger'].includes(value)
    },
    size: {
        type: String,
        default: 'medium', // small, medium, large
        validator: (value) => ['small', 'medium', 'large'].includes(value)
    },
    disabled: {
        type: Boolean,
        default: false
    },
    loading: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        default: 'button'
    },
    block: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['click'])

const buttonClasses = computed(() => [
    'base-button',
    `base-button--${props.variant}`,
    `base-button--${props.size}`,
    {
        'base-button--block': props.block,
        'base-button--loading': props.loading,
        'base-button--disabled': props.disabled
    }
])

const handleClick = (event) => {
    if (!props.disabled && !props.loading) {
        emit('click', event)
    }
}
</script>

<style scoped>
.base-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-weight: 500;
    transition: all 0.2s ease;
    outline: none;
    position: relative;
    user-select: none;
}

.base-button:focus-visible {
    outline: 2px solid var(--focus-color, #007AFF);
    outline-offset: 2px;
}

/* Sizes */
.base-button--small {
    height: 32px;
    padding: 0 12px;
    font-size: 14px;
}

.base-button--medium {
    height: 40px;
    padding: 0 16px;
    font-size: 16px;
}

.base-button--large {
    height: 48px;
    padding: 0 24px;
    font-size: 18px;
}

/* Variants */
.base-button--primary {
    background: #007AFF;
    color: white;
}

.base-button--primary:hover:not(:disabled) {
    background: #0056CC;
}

.base-button--secondary {
    background: #F2F2F7;
    color: #000;
}

.base-button--secondary:hover:not(:disabled) {
    background: #E5E5EA;
}

.base-button--ghost {
    background: transparent;
    color: #007AFF;
    border: 1px solid #007AFF;
}

.base-button--ghost:hover:not(:disabled) {
    background: rgba(0, 122, 255, 0.1);
}

.base-button--danger {
    background: #FF3B30;
    color: white;
}

.base-button--danger:hover:not(:disabled) {
    background: #D70015;
}

/* States */
.base-button--block {
    width: 100%;
}

.base-button--disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.base-button--loading {
    cursor: wait;
}

.button-text {
    margin-left: 8px;
}

.button-loading {
    display: flex;
    align-items: center;
    justify-content: center;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top: 2px solid transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .base-button--secondary {
        background: #2C2C2E;
        color: #fff;
    }
    
    .base-button--secondary:hover:not(:disabled) {
        background: #3A3A3C;
    }
}
</style>