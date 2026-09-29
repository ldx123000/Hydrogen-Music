<template>
    <Selector
        :options="options"
        :model-value="modelValue"
        :max-items="maxItems"
        :loading="loading"
        :searchable="true"
        search-placeholder="搜索字体"
        loading-text="正在读取系统字体..."
        empty-text="未找到字体"
        :option-width="260"
        @update:modelValue="value => emit('update:modelValue', value)"
        @change="(value, item) => emit('change', value, item)"
        @open="emit('open')"
    >
        <template #selected="{ item }">
            <span
                class="font-selector-preview"
                :style="fontPreviewStyle(item)"
            >
                {{ item?.label || DEFAULT_FONT_OPTION.label }}
            </span>
        </template>
        <template #option="{ item }">
            <span class="font-selector-preview" :style="fontPreviewStyle(item)">{{ item.label }}</span>
        </template>
    </Selector>
</template>

<script setup>
import Selector from './Selector.vue'
import { DEFAULT_FONT_OPTION } from '../utils/fontResolver'
import { CUSTOM_FONT_FACE_NAME } from '../utils/setFont'

defineProps({
    options: {
        type: Array,
        default: () => [],
    },
    modelValue: {
        type: String,
        default: '',
    },
    loading: {
        type: Boolean,
        default: false,
    },
    maxItems: {
        type: Number,
        default: 8,
    },
})

const emit = defineEmits(['update:modelValue', 'change', 'open'])

function fontPreviewStyle(item) {
    const fontName = String(item?.value || '').replace(/["\\]/g, '').trim()
    return {
        fontFamily: fontName ? `"${fontName}", ${CUSTOM_FONT_FACE_NAME}` : CUSTOM_FONT_FACE_NAME,
    }
}
</script>

<style scoped lang="scss">
.font-selector-preview {
    display: block;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
</style>
