<template>
  <div class="selector" ref="select" @click="changeOptionsVisible">
    <div class="selector-head">
      <slot name="selected" :item="current">
        <span class="select-head-cont" :class="{ 'long-label': isLongLabel(current?.label) }">{{ current?.label }}</span>
      </slot>
    </div>
    <teleport to="body">
      <transition name="selector" @enter="positionOverlay">
        <div
          class="selector-option"
          :style="overlayStyle"
          v-if="option"
          ref="overlay"
        >
          <input
            v-if="searchable"
            ref="searchInput"
            v-model="keyword"
            class="selector-search"
            :placeholder="searchPlaceholder"
            @keydown.stop
          />
          <div v-if="loading" class="selector-status">{{ loadingText }}</div>
          <div v-else-if="visibleOptions.length === 0" class="selector-status">{{ emptyText }}</div>
          <div
            v-else
            class="selector-option-item"
            v-for="item in visibleOptions"
            :key="item.value ?? item.label"
            @click="changeOption(item)"
            :class="{
              'selector-option-item-selected': modelValue === item.value,
            }"
          >
            <slot name="option" :item="item">
              <span :class="{ 'long-label': isLongLabel(item?.label) }">{{ item?.label }}</span>
            </slot>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { absolutePosition } from "../utils/domHandler";

const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  modelValue: null,
  maxItems: {
    type: Number,
    default: 4,
  },
  searchable: {
    type: Boolean,
    default: false,
  },
  searchPlaceholder: {
    type: String,
    default: "搜索",
  },
  loading: {
    type: Boolean,
    default: false,
  },
  loadingText: {
    type: String,
    default: "正在加载...",
  },
  emptyText: {
    type: String,
    default: "暂无选项",
  },
  optionWidth: {
    type: [Number, String],
    default: 200,
  },
});
const emit = defineEmits(["update:modelValue", "change", "open"]);

const select = ref();
const overlay = ref();
const searchInput = ref();
const option = ref(false);
const keyword = ref("");
const current = computed(() =>
  props.options.find((x) => x.value === props.modelValue)
);
const OPTION_ROW_HEIGHT = 34;
const OPTION_PADDING_HEIGHT = 16;
const SEARCH_EXTRA_HEIGHT = 56;
const optionWidthValue = computed(() =>
  typeof props.optionWidth === "number" ? `${props.optionWidth}px` : props.optionWidth
);
const visibleOptions = computed(() => {
  const searchText = keyword.value.trim().toLocaleLowerCase();
  if (!searchText) return props.options;

  return props.options.filter((item) => {
    const label = String(item?.label || "").toLocaleLowerCase();
    const value = String(item?.value || "").toLocaleLowerCase();
    return label.includes(searchText) || value.includes(searchText);
  });
});
const overlayStyle = computed(() => {
  const extraHeight = props.searchable ? SEARCH_EXTRA_HEIGHT : OPTION_PADDING_HEIGHT;
  const optionCount = visibleOptions.value.length;
  const rowCount = props.loading || optionCount === 0
    ? 1
    : Math.min(optionCount, props.maxItems);
  return {
    "--option-width": optionWidthValue.value,
    "--open-height": `${rowCount * OPTION_ROW_HEIGHT + extraHeight}px`,
    width: optionWidthValue.value,
    maxHeight: props.maxItems * OPTION_ROW_HEIGHT + extraHeight + "px",
  };
});

const changeOption = (e) => {
  emit("update:modelValue", e.value);
  emit("change", e.value, e);
  option.value = false;
  keyword.value = "";
};

const isLongLabel = label => label?.length >= 20

function positionOverlay() {
  absolutePosition(overlay.value, select.value)
}

const openOptions = () => {
  option.value = true;
  emit("open");
  nextTick(() => {
    positionOverlay();
    if (props.searchable) searchInput.value?.focus();
  });
};

const clickOutside = (event) => {
  if (select.value?.contains(event.target)) return;
  if (overlay.value?.contains(event.target)) return;
  option.value = false;
};
onMounted(() => {
  window.addEventListener("click", clickOutside);
});
onUnmounted(() => {
  window.removeEventListener("click", clickOutside);
});

const changeOptionsVisible = () => {
  if (option.value) {
    option.value = false;
    return;
  }
  openOptions();
};
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
  overflow-x: hidden;
  overflow-y: auto;
  background: rgb(228, 240, 240);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  line-height: 25px;
  user-select: none;
  padding: 8px 0;
  z-index: 1000;
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
  width: var(--option-width, 200px);
  height: 34px;
  box-sizing: border-box;
  font: 13px SourceHanSansCN-Bold;
  background-image: linear-gradient(90deg, black, black);
  background-repeat: repeat-y;
  background-position: calc(var(--option-width, 200px) * -1) 0;
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

.selector-search {
  margin: 0 10px 8px;
  width: calc(100% - 20px);
  height: 32px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.55);
  color: black;
  border: none;
  outline: none;
  font: 13px SourceHanSansCN-Bold;
  box-sizing: border-box;
}

.selector-status {
  height: 34px;
  padding: 0 16px;
  line-height: 34px;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-sizing: border-box;
  font: 13px SourceHanSansCN-Bold;
  color: rgba(0, 0, 0, 0.58);
}

:global(.dark) .selector-search {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--border);
}

:global(.dark) .selector-status {
  color: var(--muted-text) !important;
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
  height: var(--open-height);
  &.selector-option {
    padding: 8px 0;
  }
}
</style>
