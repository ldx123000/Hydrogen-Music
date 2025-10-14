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
    <!-- macOS 使用原生交通灯，不在渲染层自绘 -->
    <template v-if="isMacOS"></template>

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
