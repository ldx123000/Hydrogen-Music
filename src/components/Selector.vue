<template>
  <div class="selector" ref="select" @click="changeOptionsVisible">
    <div class="selector-head">
      <span class="select-head-cont" :class="{ 'long-label': isLongLabel(current?.label) }">{{ current?.label }}</span>
    </div>
    <teleport to="body">
      <transition name="selector" @enter="absolutePosition(overlay, select)">
        <div
          class="selector-option"
          :style="{
            '--count': options.length < maxItems ? options.length : maxItems,
            maxHeight: maxItems * 34 + 16 + 'px',
          }"
          v-if="option"
          ref="overlay"
        >
          <div
            class="selector-option-item"
            v-for="item in options"
            @click="changeOption(item)"
            :class="{
              'selector-option-item-selected': modelValue === item.value,
            }"
          >
            <span :class="{'long-label' :isLongLabel(item?.label)}">{{ item?.label }}</span>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>
<script setup>
import { computed, onActivated, onDeactivated, ref } from "vue";
import { absolutePosition } from "../utils/domHandler";

const props = defineProps({
  options: Array,
  modelValue: null,
  maxItems: {
    type: Number,
    default: 4,
  },
});
const emit = defineEmits(["update:modelValue"]);

const select = ref();
const overlay = ref();
const option = ref(false);
const current = computed(() =>
  props.options.find((x) => x.value === props.modelValue)
);

const changeOption = (e) => {
  emit("update:modelValue", e.value);
  option.value = false;
};

const isLongLabel = (label) => {
  return label?.length >= 20
}

let clickOutside = (event) => {
  if (select.value && !select.value.contains(event.target)) {
    option.value = false;
  }
};
onActivated(() => {
  window.addEventListener("click", clickOutside);
});
onDeactivated(() => {
  window.removeEventListener("click", clickOutside);
});

const changeOptionsVisible = () => (option.value = !option.value);
</script>

<style scoped lang="scss">
.selector {
  position: relative;
  &-head {
    text-align: center;
    box-sizing: border-box;
  }
}

.selector-option {
  position: absolute;
  overflow-y: overlay;
  background: rgb(228, 240, 240);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  line-height: 25px;
  user-select: none;
  padding: 8px 0;
}

.selector-head{
  padding: 2px 10px;
  width: 100%;
}
.selector-head,.selector-option-item{
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.selector-head:hover .long-label, .selector-option-item:hover .long-label{
    display: block;
    width: fit-content;
    animation: slide-label 5s linear infinite alternate;
}

.selector-option-item {
  width: 200px;
  height: 34px;
  font: 13px SourceHanSansCN-Bold;
  background-image: linear-gradient(90deg, black, black);
  background-repeat: repeat-y;
  background-position: -200px 0;
  padding: 0 16px;
  line-height: 34px;
  transition: background-position 0.2s, color 0.2s;
  cursor: pointer;
  text-align: center;
  &:hover {
    background-position: 0 0;
    color: white;
  }
  &-selected {
    background-color: black;
    color: white;
  }
}

@keyframes slide-label{
  from {
    transform: translatex(0%);
  }
  to{
    transform: translatex(-60%);
  }
}

::-webkit-scrollbar-track {
  border-radius: 0;
}

::-webkit-scrollbar {
  -webkit-appearance: none;
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  cursor: pointer;
  border-radius: 0;
  background: rgba(0, 0, 0, 0.15);
  transition: color 0.2s ease;
}
</style>
<style lang="scss">
.selector-enter-active,
.selector-leave-active {
  transition: all .225s;
  overflow: hidden;
  box-sizing: content-box;
}
.selector-enter-from,
.selector-leave-to {
  height: 0;
  &.selector-option {
    padding: 0;
  }
}
.selector-enter-to,
.selector-leave-from {
  height: calc(var(--count) * 34px);
  &.selector-option {
    padding: 8px 0;
  }
}
</style>
