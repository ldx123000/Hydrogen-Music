<script setup>
import { ref, onBeforeUnmount, onMounted, useAttrs } from 'vue';

defineOptions({
    inheritAttrs: false,
});

const isMacOS = ref(false);
const isWindowMaximized = ref(false);
let removeWindowMaximizedListener = null;
const attrs = useAttrs();

onMounted(() => {
    // 检测是否为 macOS
    isMacOS.value = navigator.platform.toLowerCase().includes('mac');

    if (typeof windowApi.getWindowMaximizedState === 'function') {
        windowApi.getWindowMaximizedState()
            .then((state) => {
                isWindowMaximized.value = !!state;
            })
            .catch(() => {});
    }

    if (typeof windowApi.onWindowMaximizedChange === 'function') {
        removeWindowMaximizedListener = windowApi.onWindowMaximizedChange((state) => {
            isWindowMaximized.value = !!state;
        });
    }
});

onBeforeUnmount(() => {
    removeWindowMaximizedListener?.();
    removeWindowMaximizedListener = null;
});

function windowControl(option) {
    if (option == 1) windowApi.windowMin('window-min');
    else if (option == 2) windowApi.windowMax('window-max');
    else windowApi.windowClose('window-close');
}
</script>

<template>
    <!-- macOS 使用原生交通灯，不在渲染层自绘 -->
    <div v-if="!isMacOS" class="window-control windows" v-bind="attrs">
        <div @click="windowControl(1)" class="minimize">
            <svg t="1668091020963" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1210" width="200" height="200">
                <path d="M65.23884 456.152041 958.760137 456.152041l0 111.695918L65.23884 567.847959 65.23884 456.152041z" p-id="1211"></path>
            </svg>
        </div>
        <div @click="windowControl(2)" class="maximize">
            <svg v-if="isWindowMaximized" t="1668091098382" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1187" width="200" height="200">
                <path
                    d="M277.333333 149.333333h448a64 64 0 0 1 64 64v106.666667h-85.333333V234.666667H277.333333v426.666666h85.333334v85.333334H277.333333a64 64 0 0 1-64-64V213.333333a64 64 0 0 1 64-64z"
                    p-id="1188"
                ></path>
                <path
                    d="M426.666667 277.333333h384a64 64 0 0 1 64 64v384a64 64 0 0 1-64 64H426.666667a64 64 0 0 1-64-64V341.333333a64 64 0 0 1 64-64z m21.333333 85.333334v341.333333h341.333333V362.666667H448z"
                    p-id="1189"
                ></path>
            </svg>
            <svg v-else t="1668091098382" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1187" width="200" height="200">
                <path
                    d="M128.576377 895.420553 128.576377 128.578424l766.846222 0 0 766.842129L128.576377 895.420553zM799.567461 224.434585 224.432539 224.434585l0 575.134923 575.134923 0L799.567461 224.434585z"
                    p-id="1188"
                ></path>
            </svg>
        </div>
        <div @click="windowControl(0)" class="close-window">
            <svg t="1668091127480" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1341" width="200" height="200">
                <path
                    d="M956.171172 875.411847l-80.757279 80.757279L511.997953 592.757279 148.586107 956.170149 67.828828 875.411847l363.411847-363.411847L67.828828 148.58713l80.757279-80.757279 363.411847 363.411847L875.413893 67.829851l80.757279 80.757279L592.756255 512 956.171172 875.411847z"
                    p-id="1342"
                ></path>
            </svg>
        </div>
    </div>
</template>

<style scoped lang="scss">

// Windows/Linux 风格的窗口控制按钮
.window-control.windows {
    width: 130px;
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;

    div {
        display: flex;
        opacity: 0.5;
        transition: 0.3s;
        padding: 10px;

        &:hover {
            opacity: 1;
            cursor: pointer;
        }

        svg {
            width: 18px;
            height: 18px;
        }
    }
}
</style>
