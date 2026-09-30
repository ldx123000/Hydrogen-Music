<script setup>
  import { ref } from 'vue'
  import { useOtherStore } from '../store/otherStore';
  const otherStore = useOtherStore()
  const show = ref(true)
  const toUpdate = () => {
    windowApi.toRegister("https://github.com/ldx123000/Hydrogen-Music/releases")
  }
  const close = () => {
    show.value = !show.value
    setTimeout(() => {
        otherStore.toUpdate = false
    }, 400);
  }
</script>

<template>
    <div class="update-page">
        <div class="update-container" :class="{'update-container-close': !show}">
            <div class="back-img"></div>
            <div class="logo">
                <img src="../assets/icon/icon.ico" alt="">
                <div class="logo-title">
                    <div>Hydrogen</div>
                    <div>Music</div>
                </div>
            </div>
            <div class="update-animation">
                <svg t="1676121807390" class="update-icon-1" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="18788" data-spm-anchor-id="a313x.7781069.0.i24" width="200" height="200"><path d="M803.5 671.7l-34.8-114.3c-3.9-12.6-17.2-19.7-29.8-15.9l-114.3 34.8c-6.3 1.9-11.3 6.3-14.1 11.7l53.7 28.7c-34.6 52.8-94.4 87.7-162.3 87.7-97.6 0-178.2-72.2-191.7-166.1h-89.5C234.7 681.3 355.2 793 502 793c101.8 0 190.8-53.9 240.5-134.7l59.3 31.6c2.8-5.4 3.6-11.9 1.7-18.2zM221.7 354.9l34.8 114.3c3.9 12.6 17.2 19.7 29.8 15.9l114.3-34.8c6.3-1.9 11.3-6.2 14.1-11.6L361 410c34.6-52.8 94.4-87.7 162.3-87.7 97.6 0 178.2 72.2 191.7 166.1h89.5c-14-143-134.6-254.8-281.3-254.8-101.8 0-190.8 53.9-240.5 134.7l-59.3-31.6c-2.7 5.4-3.6 11.9-1.7 18.2z m290.7-289c246.9 0 447.7 200.9 447.7 447.7 0 246.9-200.9 447.7-447.7 447.7-246.9 0-447.7-200.9-447.7-447.7 0-246.8 200.9-447.7 447.7-447.7z" fill="#ffffff" p-id="18789" data-spm-anchor-id="a313x.7781069.0.i25" class="selected"></path></svg>
            </div>
            <div class="update-content">
                <div class="update-img">
                    <svg t="1676135394548" class="ani-1" viewBox="0 0 1820 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3922" width="200" height="200"><path d="M1344.568889 770.180741L942.459259 222.90963c-5.12-6.921481-13.084444-10.998519-21.712592-11.188149-8.533333-0.094815-16.687407 3.792593-21.902223 10.61926L476.254815 769.611852c-4.645926 5.973333-3.508148 14.506667 2.465185 19.152592 5.973333 4.645926 14.506667 3.508148 19.152593-2.465185l422.589629-547.271111 402.10963 547.271111c4.456296 6.068148 12.98963 7.395556 19.057778 2.93926 6.068148-4.456296 7.395556-12.98963 2.939259-19.057778z" p-id="3923" fill="#ffffff"></path></svg>
                    <svg t="1676135394548" class="ani-2" viewBox="0 0 1820 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3922" width="200" height="200"><path d="M1344.568889 770.180741L942.459259 222.90963c-5.12-6.921481-13.084444-10.998519-21.712592-11.188149-8.533333-0.094815-16.687407 3.792593-21.902223 10.61926L476.254815 769.611852c-4.645926 5.973333-3.508148 14.506667 2.465185 19.152592 5.973333 4.645926 14.506667 3.508148 19.152593-2.465185l422.589629-547.271111 402.10963 547.271111c4.456296 6.068148 12.98963 7.395556 19.057778 2.93926 6.068148-4.456296 7.395556-12.98963 2.939259-19.057778z" p-id="3923" fill="#ffffff"></path></svg>
                    <svg t="1676135394548" class="ani-3" viewBox="0 0 1820 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3922" width="200" height="200"><path d="M1344.568889 770.180741L942.459259 222.90963c-5.12-6.921481-13.084444-10.998519-21.712592-11.188149-8.533333-0.094815-16.687407 3.792593-21.902223 10.61926L476.254815 769.611852c-4.645926 5.973333-3.508148 14.506667 2.465185 19.152592 5.973333 4.645926 14.506667 3.508148 19.152593-2.465185l422.589629-547.271111 402.10963 547.271111c4.456296 6.068148 12.98963 7.395556 19.057778 2.93926 6.068148-4.456296 7.395556-12.98963 2.939259-19.057778z" p-id="3923" fill="#ffffff"></path></svg>
                    <svg t="1676121383977" class="update-icon-2" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12662" width="200" height="200"><path d="M1024 651.636364 512 0 0 651.636364 279.272727 651.636364 279.272727 1024 698.181818 1024 698.181818 651.636364Z" fill="#ffffff" p-id="12663"></path></svg>
                </div>
                <div class="update-info">
                    <span class="update-title">新版本追加</span>
                    <div class="update-version">
                        <span class="update-title-en">NEW VERSION</span>
                        <div class="version">{{ otherStore.newVersion }}</div>
                    </div>
                    <div class="update-option">
                        <div class="to-update" @click="toUpdate()">前往GitHub更新</div>
                        <div class="close" @click="close()">不要了，走了</div>
                        <svg t="1676132470655" class="close-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2020" width="200" height="200"><path d="M745.610572 75.641771l-496.221642 0c-28.741601 0-51.259454 25.084305-51.259454 57.107649l0 789.362029 74.170257 0 0-772.299421 445.333648 0-331.506183 29.153994 0 766.881015 336.575642-27.442002 0 3.706415 74.170257 0L796.873096 132.74942C796.875143 100.725052 774.35729 75.641771 745.610572 75.641771zM428.767344 533.386076c-11.995195 0-21.719674-9.724479-21.719674-21.719674 0-11.995195 9.724479-21.719674 21.719674-21.719674 11.995195 0 21.719674 9.724479 21.719674 21.719674C450.487018 523.661597 440.763562 533.386076 428.767344 533.386076z" fill="#ffffff" p-id="2021"></path></svg>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
  .update-page{
    width: 100%;
    height: 100%;
    .update-container-close{
        animation: update-container-close 0.6s cubic-bezier(.5,0,.15,1) forwards !important;
        @keyframes update-container-close {
            0%{height: 50%;}
            100%{height: 0;}
        }
    }
    .update-container{
        width: 100%;
        height: 0;
        background-color: black;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        overflow: hidden;
        animation: update-container-in 1.2s cubic-bezier(.5,0,.15,1) forwards;
        @keyframes update-container-in {
            0%{height: 0;}
            100%{height: 50%;}
        }
        .back-img{
            width: 70%;
            height: 200%;
            background-image: linear-gradient(to right, rgb(0, 0, 0), rgba(0, 0, 0, 0)), url('../assets/img/halftone.png');
            transform: rotate(30deg);
            position: absolute;
            top: -60%;
            right: -15%;
            z-index: -1;
        }
        .logo{
            width: 7vh;
            height: 7vh;
            position: absolute;
            top: 4vh;
            left: 4vh;
            display: flex;
            flex-direction: row;
            transform: translateY(10%);
            animation: logo 1s cubic-bezier(.5,0,.15,1) forwards;
            @keyframes logo {
                0%{transform: translateY(10%);opacity: 0;}
                100%{transform: translateY(0);opacity: 1;}
            }
            img{
                width: 100%;
                height: 100%;
            }
            .logo-title{
                margin-left: 1.5vh;
                height: 7vh;
                font: 2.5vh Gilroy-ExtraBold;
                color: rgba(255, 255, 255, 0.90);
                text-align: left;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
        }
        .update-animation{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.94;
            .update-icon-1{
                width: 35vh;
                height: 35vh;
                animation: update-icon-1 1.2s cubic-bezier(.5,0,.15,1) forwards;
                @keyframes update-icon-1 {
                    0%{transform: scale(3) rotate(0deg);opacity: 1;}
                    90%{transform: scale(1) rotate(180deg);opacity: 1;}
                    100%{transform: scale(0.9) rotate(180deg);opacity: 0;}
                }
            }
        }
        .update-content{
            height: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            .update-img{
                width: 40vh;
                height: 40vh;
                opacity: 0.95;
                position: relative;
                transform: translate(0%, 130%);
                animation: update-img 1s 1s cubic-bezier(.5,0,.15,1) forwards;
                @keyframes update-img {
                    0%{transform: translate(0%, 130%);}
                    100%{transform: translate(0%, 30%)}
                }
                .ani-1, .ani-2, .ani-3{
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    opacity: 0;
                }
                .ani-1{
                    transform: translateY(-30%);
                    animation: ani-1 1.8s 1.2s cubic-bezier(.5,0,.15,1) infinite;
                    @keyframes ani-1 {
                        0%{transform: translateY(-30%);opacity: 0;}
                        70%{transform: translateY(-45%);opacity: 0.2;}
                        100%{transform: translateY(-45%);opacity: 0;}
                    }
                }
                .ani-2{
                    transform: translateY(-45%);
                    animation: ani-2 1.8s 1.4s cubic-bezier(.5,0,.15,1) infinite;
                    @keyframes ani-2 {
                        0%{transform: translateY(-45%);opacity: 0;}
                        70%{transform: translateY(-55%);opacity: 0.2;}
                        100%{transform: translateY(-55%);opacity: 0;}
                    }
                }
                .update-icon-2{
                    width: 40vh;
                    height: 40vh;
                }
            }
            .update-info{
                margin-left: 6vh;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                .update-title{
                    font: 9vh SourceHanSansCN-Heavy;
                    color: rgba(255, 255, 255, 0.95);
                    transform: translateX(10%);
                    opacity: 0;
                    animation: update-title 1s 1.2s cubic-bezier(.5,0,.15,1) forwards;
                    @keyframes update-title {
                        0%{transform: translateX(10%);opacity: 0;}
                        100%{transform: translateX(0);opacity: 1;}
                    }
                }
                .update-version{
                    display: flex;
                    flex-direction: row;
                    .update-title-en{
                        line-height: 6.4vh !important;
                        font: 6.4vh SourceHanSansCN-Heavy;
                        color: rgba(255, 255, 255, 0.95);
                        white-space: nowrap;
                        transform: translateX(10%);
                        opacity: 0;
                        animation: update-title-en 1s 1.1s cubic-bezier(.5,0,.15,1) forwards;
                        @keyframes update-title-en {
                            0%{transform: translateX(10%);opacity: 0;}
                            100%{transform: translateX(0);opacity: 1;}
                        }
                    }
                    .version{
                        margin-left: 1.2vh;
                        line-height: 6.4vh !important;
                        padding: 2px 6px;
                        font: 6.4vh SourceHanSansCN-Heavy;
                        color: rgba(0, 0, 0, 0.95);
                        position: relative;
                        overflow: hidden;
                        opacity: 0;
                        &::after{
                            content: '';
                            width: 100%;
                            height: 100%;
                            position: absolute;
                            top: 0;
                            left: -101%;
                            background-color: rgba(255, 255, 255, 0.95);
                            z-index: -1;
                            animation: version-back 0.6s 1.5s cubic-bezier(.5,0,.15,1) forwards;
                            @keyframes version-back {
                                0%{left: -101%;}
                                100%{left: 0%;}
                            }
                        }
                        animation: version 0.3s 1.5s cubic-bezier(.5,0,.15,1) forwards;
                        @keyframes version {
                            0%{opacity: 0;}
                            100%{opacity: 1;}
                        }
                    }
                }
                .update-option{
                    margin-top: 2.8vh;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    overflow: hidden;
                    transform: translateY(30%);
                    opacity: 0;
                    animation: update-option 0.6s 1.6s cubic-bezier(.5,0,.15,1) forwards;
                    @keyframes update-option {
                        0%{transform: translateY(30%);opacity: 0;}
                        100%{transform: translateY(0);opacity: 1;}
                    }
                    .to-update, .close{
                        padding: 0.8vh;
                        font: 2vh SourceHanSansCN-Bold;
                        color: rgba(255, 255, 255, 0.95);
                        border: 1px solid white;
                        &:hover{
                            background-color: rgba(255, 255, 255, 0.95);
                            color: black;
                            cursor: pointer;
                        }
                    }
                    .close{
                        margin-left: 16px;
                    }
                    .close-icon{
                        margin-left: 8px;
                        width: 3.6vh;
                        height: 3.6vh;
                    }
                }
            }
        }
    }
  }
</style>