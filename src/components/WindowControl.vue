<script setup>
import { ref, onMounted } from 'vue';

const isMacOS = ref(false);

onMounted(() => {
    // 检测是否为 macOS
    isMacOS.value = navigator.platform.toLowerCase().includes('mac');
});

function windowControl(option) {
    if (option == 1) windowApi.windowMin('window-min');
    else if (option == 2) windowApi.windowMax('window-max');
    else windowApi.windowClose('window-close');
}
</script>

<template>
    <!-- macOS 风格的窗口控制按钮 -->
    <div v-if="isMacOS" class="window-control macos">
        <!-- 关闭按钮（红色） -->
        <div @click="windowControl(0)" class="close-button macos-button">
            <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
        </div>
        <!-- 最小化按钮（黄色） -->
        <div @click="windowControl(1)" class="minimize-button macos-button">
            <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
        </div>
        <!-- 缩放按钮（绿色） -->
        <div @click="windowControl(2)" class="maximize-button macos-button">
            <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                <g stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none">
                    <!-- 左上角箭头 -->
                    <path d="M3 3L4.5 1.5M4.5 1.5H3M4.5 1.5V3" />
                    <!-- 右下角箭头 -->
                    <path d="M9 9L7.5 10.5M7.5 10.5H9M7.5 10.5V9" />
                </g>
            </svg>
        </div>
    </div>

    <!-- Windows/Linux 风格的窗口控制按钮 -->
    <div v-else class="window-control windows">
        <div @click="windowControl(1)" class="minimize">
            <svg t="1668091020963" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1210" width="200" height="200">
                <path d="M65.23884 456.152041 958.760137 456.152041l0 111.695918L65.23884 567.847959 65.23884 456.152041z" p-id="1211"></path>
            </svg>
        </div>
        <div @click="windowControl(2)" class="maximize">
            <svg t="1668091098382" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1187" width="200" height="200">
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
// macOS 风格的窗口控制按钮
.window-control.macos {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    width: auto;

    .macos-button {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;

        svg {
            width: 6px;
            height: 6px;
            opacity: 0;
            transition: opacity 0.2s ease;
            color: rgba(0, 0, 0, 0.7);
        }

        &:hover svg {
            opacity: 1;
        }
    }

    .close-button {
        background-color: #ff5f57;
        &:hover {
            background-color: #ff4033;
        }
    }

    .minimize-button {
        background-color: #ffbd2e;
        &:hover {
            background-color: #ffaa00;
        }
    }

    .maximize-button {
        background-color: #28ca42;
        &:hover {
            background-color: #1aad34;
        }
    }
}

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
