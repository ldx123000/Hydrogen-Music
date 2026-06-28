<template>
  <Selector
    :options="options"
    :model-value="modelValue"
    :max-items="maxItems"
    @update:modelValue="value => emit('update:modelValue', value)"
  ></Selector>
</template>

<script setup>
import Selector from './Selector.vue'

defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: String,
    default: '',
  },
  maxItems: {
    type: Number,
    default: 8,
  },
})

const emit = defineEmits(['update:modelValue'])
</script>
