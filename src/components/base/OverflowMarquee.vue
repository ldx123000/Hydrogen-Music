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
const transitionDurationMs = ref(0)
const translateXPx = ref(0)
const isOverflowing = ref(false)
const isAnimatingMode = ref(false)

let measureFrameId = null
let transitionFrameId = null
let resizeObserver = null
let cycleToken = 0
const timerIds = new Set()

const displayText = computed(() => String(props.text || ''))
const overflowThresholdPx = computed(() => (
    Number.isFinite(props.overflowThresholdPx)
        ? Math.max(0, props.overflowThresholdPx)
        : MARQUEE_THRESHOLD_PX
))
const canAnimate = computed(() => props.active && isOverflowing.value && loopDistancePx.value > 0)
const trackStyle = computed(() => ({
    transform: `translate3d(${translateXPx.value}px, 0, 0)`,
    transitionDuration: `${transitionDurationMs.value}ms`,
    '--marquee-gap': `${MARQUEE_LOOP_GAP_PX}px`,
}))
const primaryContentStyle = computed(() => (
    isAnimatingMode.value
        ? null
        : {
            width: '100%',
        }
))

function clearTimers() {
    timerIds.forEach(timerId => {
        clearTimeout(timerId)
    })
    timerIds.clear()
}

function clearAnimationFrames() {
    if (measureFrameId !== null) {
        cancelAnimationFrame(measureFrameId)
        measureFrameId = null
    }
    if (transitionFrameId !== null) {
        cancelAnimationFrame(transitionFrameId)
        transitionFrameId = null
    }
}

function scheduleTask(callback, delayMs) {
    if (typeof window === 'undefined') return null
    const timerId = window.setTimeout(() => {
        timerIds.delete(timerId)
        callback()
    }, delayMs)
    timerIds.add(timerId)
    return timerId
}

function getTravelDurationMs() {
    const distance = Math.max(0, loopDistancePx.value)
    if (distance <= 0) return 0
    return Math.max(MARQUEE_MIN_TRAVEL_MS, Math.round((distance / MARQUEE_SPEED_PX_PER_SECOND) * 1000))
}

function resetMotion() {
    cycleToken += 1
    clearTimers()
    if (transitionFrameId !== null) {
        cancelAnimationFrame(transitionFrameId)
        transitionFrameId = null
    }
    isAnimatingMode.value = false
    transitionDurationMs.value = 0
    translateXPx.value = 0
}

function animateLoop(token) {
    if (token !== cycleToken || !canAnimate.value) return

    const duration = getTravelDurationMs()
    if (duration <= 0) {
        return
    }

    isAnimatingMode.value = true
    transitionDurationMs.value = duration

    if (transitionFrameId !== null) {
        cancelAnimationFrame(transitionFrameId)
    }

    transitionFrameId = requestAnimationFrame(() => {
        transitionFrameId = null
        if (token !== cycleToken || !canAnimate.value) return

        translateXPx.value = -loopDistancePx.value
        scheduleTask(() => {
            if (token !== cycleToken || !canAnimate.value) return
            transitionDurationMs.value = 0
            translateXPx.value = 0
            transitionFrameId = requestAnimationFrame(() => {
                transitionFrameId = null
                if (token !== cycleToken || !canAnimate.value) return
                animateLoop(token)
            })
        }, duration)
    })
}

function restartMotion() {
    resetMotion()
    if (!canAnimate.value) return

    const token = cycleToken
    scheduleTask(() => {
        if (token !== cycleToken || !canAnimate.value) return
        animateLoop(token)
    }, props.startDelayMs)
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
    clearTimers()
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
    transition-property: transform;
    transition-timing-function: linear;
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
</style>
