<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { absolutePosition } from '../utils/domHandler';

const props = defineProps({
    modelValue: {
        type: String,
        default: 'default',
    },
    options: {
        type: Array,
        default: () => [],
    },
    changed: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['update:modelValue']);
const trigger = ref();
const menu = ref();
const menuOpen = ref(false);

const optionMap = computed(() => new Map(props.options.map(option => [option.value, option])));
const activeOptionValue = computed(() => props.modelValue == 'default' && optionMap.value.has('time-desc')
    ? 'time-desc'
    : props.modelValue);
const currentOption = computed(() => optionMap.value.get(activeOptionValue.value) || optionMap.value.get('default'));
const showReset = computed(() => props.changed && activeOptionValue.value != 'time-desc');
const optionGroups = computed(() => [
    {
        label: '歌曲',
        options: [
            { value: 'title-asc', label: 'A → Z' },
            { value: 'title-desc', label: 'Z → A' },
        ],
    },
    {
        label: '歌手',
        options: [
            { value: 'artist-asc', label: 'A → Z' },
            { value: 'artist-desc', label: 'Z → A' },
        ],
    },
    {
        label: optionMap.value.get('time-desc')?.label?.split(' ')[0] || '',
        options: [
            { value: 'time-desc', label: 'LATEST' },
            { value: 'time-asc', label: 'EARLIEST' },
        ],
    },
]
    .map(group => ({
        ...group,
        options: group.options.filter(option => optionMap.value.has(option.value)),
    }))
    .filter(group => group.label && group.options.length));
const triggerTitle = computed(() => `排序：${currentOption.value?.label || '默认顺序'}`);

const positionMenu = async () => {
    await nextTick();
    const searchInput = trigger.value.closest('.song-filter-input');
    absolutePosition(menu.value, searchInput, 'right');
};
const toggleMenu = () => {
    menuOpen.value = !menuOpen.value;
    if (menuOpen.value) void positionMenu();
};
const closeMenu = () => {
    menuOpen.value = false;
};
const selectOption = value => {
    emit('update:modelValue', value);
    closeMenu();
};

onMounted(() => {
    document.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', closeMenu);
    window.removeEventListener('resize', closeMenu);
});
</script>

<template>
    <div ref="trigger" class="song-sort-control" @click.stop @keydown.esc.stop="closeMenu">
        <button
            class="sort-trigger"
            :class="{ 'sort-trigger-open': menuOpen }"
            type="button"
            :title="triggerTitle"
            :aria-label="triggerTitle"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
        >
            <span class="sort-lines" aria-hidden="true">
                <i class="sort-line sort-line-1"></i>
                <i class="sort-line sort-line-2"></i>
                <i class="sort-line sort-line-3"></i>
            </span>
        </button>

        <teleport to="body">
            <transition name="song-sort-menu" @enter="positionMenu">
                <div v-if="menuOpen" ref="menu" class="song-sort-menu" role="menu" @click.stop>
                    <div class="sort-menu-header">
                        <span>排序方式</span>
                        <small v-if="!showReset">SORT</small>
                        <button v-else class="sort-reset" type="button" title="恢复原始顺序" @click="selectOption('default')">RESET</button>
                    </div>

                    <div v-for="group in optionGroups" :key="group.label" class="sort-option-group">
                        <span class="sort-group-label">{{ group.label }}</span>
                        <button
                            v-for="option in group.options"
                            :key="option.value"
                            class="direction-option"
                            :class="{ 'option-selected': activeOptionValue == option.value }"
                            type="button"
                            role="menuitemradio"
                            :aria-checked="activeOptionValue == option.value"
                            @click="selectOption(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
            </transition>
        </teleport>
    </div>
</template>

<style scoped lang="scss">
.song-sort-control,
.sort-trigger {
    width: 100%;
    height: 100%;
}

.sort-trigger {
    padding: 6px 7px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    opacity: 0.68;
    cursor: pointer;
    transition:
        opacity 0.2s ease,
        background-color 0.2s ease;

    &:hover,
    &:focus-visible,
    &.sort-trigger-open {
        opacity: 1;
        background: var(--layer);
    }

}

.sort-lines {
    width: 14px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
}

.sort-line {
    height: 1px;
    display: block;
    background: currentColor;
}
.sort-line-1 { width: 14px; }
.sort-line-2 { width: 10px; }
.sort-line-3 { width: 6px; }

.song-sort-menu {
    --sort-menu-bg: #e4f0f0;
    --sort-menu-text: #000000;
    --sort-menu-muted: #5b6066;
    --sort-menu-active-bg: #000000;
    --sort-menu-active-text: #ffffff;
    --sort-menu-border: var(--border);
    width: 210px;
    padding: 11px 12px 12px;
    position: absolute;
    box-sizing: border-box;
    color: var(--sort-menu-text) !important;
    background-color: var(--sort-menu-bg);
    border: 1px solid var(--sort-menu-border);
    border-radius: 0;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
    user-select: none;
    z-index: 1000;

    button {
        border: 0;
        border-radius: 0;
        outline: 0;
        color: var(--sort-menu-text) !important;
        background-color: var(--sort-menu-bg) !important;
        cursor: pointer;
    }
}

.sort-menu-header {
    margin-bottom: 8px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;

    span {
        font: 11px SourceHanSansCN-Bold;
        color: var(--sort-menu-text) !important;
    }
    small {
        font: 8px Geometos;
        color: var(--sort-menu-muted) !important;
        letter-spacing: 1px;
    }

    .sort-reset {
        padding: 0;
        font: 8px Geometos;
        letter-spacing: 1px;
        color: var(--sort-menu-muted) !important;
        transition: color 0.2s ease;

        &:hover {
            color: var(--sort-menu-text) !important;
        }
    }
}

.sort-option-group {
    margin-top: 8px;
    display: grid;
    grid-template-columns: 58px 1fr 1fr;
    gap: 5px;
    align-items: center;
}
.sort-menu-header + .sort-option-group {
    margin-top: 0;
}

.sort-group-label {
    font: 10px SourceHanSansCN-Bold;
    color: var(--sort-menu-muted) !important;
}

.direction-option {
    height: 25px;
    padding: 0;
    border: 1px solid var(--sort-menu-border) !important;
    font: 9px Geometos;
    transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        color 0.2s ease;

    &:hover,
    &:focus-visible,
    &.option-selected {
        border-color: var(--sort-menu-active-bg) !important;
        background-color: var(--sort-menu-active-bg) !important;
        color: var(--sort-menu-active-text) !important;
    }
}

:global(html.dark .song-sort-menu),
:global(.dark .song-sort-menu) {
    --sort-menu-bg: #2a2e34;
    --sort-menu-text: #ffffff;
    --sort-menu-muted: #ffffff;
    --sort-menu-active-bg: #ffffff;
    --sort-menu-active-text: #000000;
}

.song-sort-menu-enter-active,
.song-sort-menu-leave-active {
    transition:
        opacity 0.16s ease,
        transform 0.16s ease;
}
.song-sort-menu-enter-from,
.song-sort-menu-leave-to {
    opacity: 0;
    transform: scaleY(0.94);
}
</style>
