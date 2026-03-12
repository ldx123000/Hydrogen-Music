<script setup>
import { computed } from 'vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: '',
    },
    compact: {
        type: Boolean,
        default: false,
    },
    showIcon: {
        type: Boolean,
        default: false,
    },
    placeholder: {
        type: String,
        default: '搜索歌曲 / 歌手',
    },
});

const emit = defineEmits(['update:modelValue']);
const inputValue = computed({
    get() {
        return props.modelValue;
    },
    set(value) {
        emit('update:modelValue', value);
    },
});
</script>

<template>
    <div class="song-filter-input" :class="{ 'song-filter-input-compact': compact, 'song-filter-input-with-icon': showIcon }">
        <span v-if="showIcon" class="search-icon" aria-hidden="true"></span>
        <input
            v-model="inputValue"
            class="filter-input"
            type="text"
            :placeholder="placeholder"
            spellcheck="false"
        />
        <span class="search-border search-border1"></span>
        <span class="search-border search-border2"></span>
        <span class="search-border search-border3"></span>
        <span class="search-border search-border4"></span>
        <span class="search-point search-point1"></span>
        <span class="search-point search-point2"></span>
        <span class="search-point search-point3"></span>
        <span class="search-point search-point4"></span>
    </div>
</template>

<style scoped lang="scss">
$borderSize: 2px;
$pointOffset: -1px;

.song-filter-input {
    width: min(320px, 100%);
    max-width: 100%;
    height: 34px;
    box-sizing: border-box;
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    padding: 0 12px;
    background: transparent;
    border: none;

    .filter-input {
        width: 100%;
        height: 100%;
        padding: 0;
        border: none;
        outline: none;
        position: relative;
        z-index: 1;
        background: transparent !important;
        background-color: transparent !important;
        color: var(--text) !important;
        font: 12px SourceHanSansCN-Bold;
        letter-spacing: 0.2px;
        text-align: left;

        &::placeholder {
            color: var(--muted-text) !important;
            font: 10px Geometos;
            letter-spacing: 1px;
        }
    }

    .search-border,
    .search-point {
        position: absolute;
        pointer-events: none;
    }

    .search-border {
        width: 8px;
        height: 8px;
    }

    .search-border1 {
        top: 0;
        left: 0;
        border-top: $borderSize solid var(--text);
        border-left: $borderSize solid var(--text);
    }

    .search-border2 {
        top: 0;
        right: 0;
        border-top: $borderSize solid var(--text);
        border-right: $borderSize solid var(--text);
    }

    .search-border3 {
        right: 0;
        bottom: 0;
        border-right: $borderSize solid var(--text);
        border-bottom: $borderSize solid var(--text);
    }

    .search-border4 {
        bottom: 0;
        left: 0;
        border-bottom: $borderSize solid var(--text);
        border-left: $borderSize solid var(--text);
    }

    .search-point {
        width: 4px;
        height: 4px;
        background: var(--text);
    }

    .search-point1 {
        top: $pointOffset;
        left: $pointOffset;
    }

    .search-point2 {
        top: $pointOffset;
        right: $pointOffset;
    }

    .search-point3 {
        right: $pointOffset;
        bottom: $pointOffset;
    }

    .search-point4 {
        bottom: $pointOffset;
        left: $pointOffset;
    }

    .search-icon {
        position: absolute;
        top: 50%;
        left: 10px;
        width: 7px;
        height: 7px;
        border: 1.5px solid var(--text);
        border-radius: 50%;
        transform: translateY(-58%);
        pointer-events: none;
        z-index: 1;

        &::after {
            content: '';
            position: absolute;
            right: -3px;
            bottom: -2px;
            width: 5px;
            height: 1.5px;
            background: var(--text);
            transform: rotate(45deg);
            transform-origin: center;
        }
    }
}

.song-filter-input-compact {
    --compact-notch: 6px;
    --compact-line: var(--border);

    height: 24px;
    padding: 0 10px;
    border: 1px solid var(--compact-line);
    background: transparent;
    clip-path: polygon(0 0, calc(100% - var(--compact-notch)) 0, 100% var(--compact-notch), 100% 100%, var(--compact-notch) 100%, 0 calc(100% - var(--compact-notch)));
    transition: border-color 0.2s ease;

    &:hover,
    &:focus-within {
        --compact-line: var(--ld-border, var(--text));
    }

    .search-border,
    .search-point {
        display: none;
    }

    .search-icon {
        left: 8px;
        width: 8px;
        height: 8px;
        opacity: 0.9;
        border-color: var(--compact-line);
        transition:
            border-color 0.2s ease,
            opacity 0.2s ease;

        &::after {
            right: -4px;
            bottom: -2px;
            width: 6px;
            background: var(--compact-line);
            transition: background-color 0.2s ease;
        }
    }

    .filter-input {
        letter-spacing: 0.3px;
    }

    .filter-input::placeholder {
        font-size: 12px;
        letter-spacing: 0.6px;
    }

    .filter-input:focus::placeholder {
        color: transparent !important;
    }
}
</style>
