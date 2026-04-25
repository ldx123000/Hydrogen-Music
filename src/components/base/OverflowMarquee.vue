<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
    text: {
        type: String,
        default: '',
    },
    active: {
        type: Boolean,
        default: true,
    },
    startDelayMs: {
        type: Number,
        default: 900,
    },
    overflowThresholdPx: {
        type: Number,
        default: 8,
    },
})

const MARQUEE_THRESHOLD_PX = 8
const MARQUEE_LOOP_GAP_PX = 36
const MARQUEE_SPEED_PX_PER_SECOND = 42
const MARQUEE_MIN_TRAVEL_MS = 1200

const viewportRef = ref(null)
const primaryContentRef = ref(null)
const loopDistancePx = ref(0)
const isOverflowing = ref(false)
const isAnimatingMode = ref(false)

let measureFrameId = null
let restartFrameId = null
let restartSecondFrameId = null
let resizeObserver = null

const displayText = computed(() => String(props.text || ''))
const overflowThresholdPx = computed(() => (
    Number.isFinite(props.overflowThresholdPx)
        ? Math.max(0, props.overflowThresholdPx)
        : MARQUEE_THRESHOLD_PX
))
const canAnimate = computed(() => props.active && isOverflowing.value && loopDistancePx.value > 0)
const trackStyle = computed(() => ({
    '--marquee-distance': `${loopDistancePx.value}px`,
    '--marquee-duration': `${getTravelDurationMs()}ms`,
    '--marquee-delay': `${Math.max(0, Number(props.startDelayMs) || 0)}ms`,
    '--marquee-gap': `${MARQUEE_LOOP_GAP_PX}px`,
}))
const primaryContentStyle = computed(() => (
    isAnimatingMode.value
        ? null
        : {
            width: '100%',
        }
))

function clearAnimationFrames() {
    if (measureFrameId !== null) {
        cancelAnimationFrame(measureFrameId)
        measureFrameId = null
    }
    if (restartFrameId !== null) {
        cancelAnimationFrame(restartFrameId)
        restartFrameId = null
    }
    if (restartSecondFrameId !== null) {
        cancelAnimationFrame(restartSecondFrameId)
        restartSecondFrameId = null
    }
}

function getTravelDurationMs() {
    const distance = Math.max(0, loopDistancePx.value)
    if (distance <= 0) return 0
    return Math.max(MARQUEE_MIN_TRAVEL_MS, Math.round((distance / MARQUEE_SPEED_PX_PER_SECOND) * 1000))
}

function resetMotion() {
    if (restartFrameId !== null) {
        cancelAnimationFrame(restartFrameId)
        restartFrameId = null
    }
    if (restartSecondFrameId !== null) {
        cancelAnimationFrame(restartSecondFrameId)
        restartSecondFrameId = null
    }
    isAnimatingMode.value = false
}

function restartMotion() {
    resetMotion()
    if (!canAnimate.value) return

    // Force the class to be removed for a frame before re-adding it so CSS
    // restarts cleanly after text, width, font, or active-state changes.
    restartFrameId = requestAnimationFrame(() => {
        restartFrameId = null
        restartSecondFrameId = requestAnimationFrame(() => {
            restartSecondFrameId = null
            if (!canAnimate.value) return
            isAnimatingMode.value = true
        })
    })
}

async function measureOverflow() {
    await nextTick()

    const viewportEl = viewportRef.value
    const contentEl = primaryContentRef.value
    if (!viewportEl || !contentEl) {
        resetMotion()
        return
    }

    const nextContentWidth = Math.ceil(contentEl.scrollWidth)
    const nextOverflowDistance = Math.max(0, Math.ceil(nextContentWidth - viewportEl.clientWidth))
    loopDistancePx.value = nextContentWidth + MARQUEE_LOOP_GAP_PX
    isOverflowing.value = nextOverflowDistance > overflowThresholdPx.value

    restartMotion()
}

function queueMeasure() {
    if (typeof window === 'undefined') return
    if (measureFrameId !== null) {
        cancelAnimationFrame(measureFrameId)
    }
    measureFrameId = requestAnimationFrame(() => {
        measureFrameId = null
        void measureOverflow()
    })
}

onMounted(() => {
    queueMeasure()

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
            queueMeasure()
        })

        if (viewportRef.value) resizeObserver.observe(viewportRef.value)
    }

    window.addEventListener('resize', queueMeasure)
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        document.fonts.ready.then(() => {
            queueMeasure()
        }).catch(() => {})
    }
})

onBeforeUnmount(() => {
    clearAnimationFrames()
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }
    window.removeEventListener('resize', queueMeasure)
})

watch(
    () => [displayText.value, props.active, props.startDelayMs, overflowThresholdPx.value],
    () => {
        queueMeasure()
    },
    { flush: 'post' }
)
</script>

<template>
    <span ref="viewportRef" class="overflow-marquee">
        <span
            class="overflow-marquee__track"
            :class="{ 'overflow-marquee__track--animated': isAnimatingMode }"
            :style="trackStyle"
        >
            <span
                ref="primaryContentRef"
                class="overflow-marquee__content"
                :class="{ 'overflow-marquee__content--animated': isAnimatingMode }"
                :style="primaryContentStyle"
            >
                {{ displayText }}
            </span>
            <span v-if="isAnimatingMode" class="overflow-marquee__content overflow-marquee__content--duplicate" aria-hidden="true">
                {{ displayText }}
            </span>
        </span>
    </span>
</template>

<style scoped lang="scss">
.overflow-marquee {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
}

.overflow-marquee__track {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transform: translate3d(0, 0, 0);
}

.overflow-marquee__track--animated {
    display: inline-flex;
    align-items: center;
    width: auto;
    min-width: max-content;
    overflow: visible;
    text-overflow: clip;
    gap: var(--marquee-gap);
    will-change: transform;
    animation-name: overflow-marquee-scroll;
    animation-duration: var(--marquee-duration);
    animation-delay: var(--marquee-delay);
    animation-timing-function: linear;
    animation-iteration-count: infinite;
}

.overflow-marquee__content {
    display: block;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.overflow-marquee__content--animated {
    display: inline-block;
    width: auto;
    min-width: max-content;
    overflow: visible;
    text-overflow: clip;
}

.overflow-marquee__content--duplicate {
    flex-shrink: 0;
}

@keyframes overflow-marquee-scroll {
    from {
        transform: translate3d(0, 0, 0);
    }

    to {
        transform: translate3d(calc(-1 * var(--marquee-distance)), 0, 0);
    }
}
</style>
