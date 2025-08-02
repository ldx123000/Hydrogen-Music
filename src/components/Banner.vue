<script setup>
  import {  ref, onActivated } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router';
  import { getBanner } from '../api/other';
  const timer1 = ref(null)
  const timer2 = ref(null)
  const timer3 = ref(null)
  const leftVal = ref(0)
  const imgWidth = ref(35)
  const currentIndex = ref(0)
  const transitionTime = ref(0)
  const bannerTimer1 = ref(false)
  const bannerTimer2 = ref(false)
  const bannerList = ref([{}])
    //获取轮播图，0为pc端轮播图,此处选择的是ipad端

    loadData(3)

    async function loadData(type) {
        const bannerData = await getBanner(type)
        bannerList.value = bannerData.banners
    }

    onActivated(() => {
        bannerStart()
    })

    onBeforeRouteLeave(() => {
        clearInterval(timer1.value)
    })

    //banner开始轮播
    function bannerStart() {
        clearInterval(timer1.value)
        timer1.value = setInterval(() => {
            nextImg()
        }, 3000);
    }

    //banner鼠标移入停止计时
    function bannerMouse(mouseEvent) {
        mouseEvent == true ? clearInterval(timer1.value) : bannerStart()
    }

    //banner下一张
    function nextImg() {
        if(leftVal.value == (bannerList.value.length-1) * imgWidth.value) {
            transitionTime.value = 0.8
            leftVal.value += imgWidth.value
            currentIndex.value = 0
            setTimeout(()=>{
                transitionTime.value = 0
                leftVal.value = 0
           },transitionTime.value * 1000)
        } else {
            transitionTime.value = 0.8
            leftVal.value += imgWidth.value
            currentIndex.value++
        }
        bannerTimerFun()
    }

    //banner下方选择条
    function imgSlect(index) {
        bannerTimerFun()
        bannerStart()
        transitionTime.value = 0.8
        leftVal.value = index * imgWidth.value
        currentIndex.value = index
    }

    function nextBanner() {
        bannerStart()
        nextImg()
    }

    //banner右上角计时器
    function bannerTimerFun() {
        clearTimeout(timer2.value)
        clearTimeout(timer3.value)
        bannerTimer1.value = false
        bannerTimer2.value = false
        timer2.value = setTimeout(() => {
            bannerTimer1.value = true
            bannerTimer2.value = true
        }, 1);
        timer2.value = setTimeout(() => {
            bannerTimer1.value = false
        }, 900);
        timer3.value = setTimeout(() => {
            bannerTimer2.value = false
        }, 2900);
    }

    //点击banner
    function bannerItem(item, index) {
        console.log("bannerClick")
    }
</script>

<template>
  <div>
    <div class="banner">
        <div class="banner-header">
            <div class="banner-title">BREAKING NEWS</div>
            <div class="banner-timer">
                <div class="line"></div>
                <div :class="{'timer': true, 'timer-active': bannerTimer1}">
                    <div :class="{'timer-animation': true, 'timer-animation-active': bannerTimer2}"></div>
                </div>
            </div>
        </div>
        <div class="banner-img" @mouseenter="bannerMouse(true)" @mouseleave="bannerMouse(false)">
            <div class="img-box" :style="{left:`-${leftVal}vw`,transition:`${transitionTime}s`}">
                <img @click="bannerItem(item, index)" v-for="(item, index) in bannerList" :src="(item.pic || item.imageUrl) + '?param=720y280'" alt="">
                <img :src="(bannerList[0].pic || bannerList[0].imageUrl) + '?param=720y280'" alt="">
            </div>
        </div>
        <div class="selector-box">
            <div @click="imgSlect(index)" class="selector" v-for="(item, index) in bannerList.length">
                <div :class="{'selector-style': true,'selector-style-active': currentIndex == index}"></div>
            </div>
        </div>
        <div class="banner-next" @click="nextBanner()"></div>
      </div>
  </div>
</template>

<style scoped lang="scss">
  .banner{
        position: relative;
        .banner-img{
            width: 35vw;
            height: 13.7vw;
            position: relative;
            overflow: hidden;
            .img-box{
                width: 100%;
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: flex-start;
                position: absolute;
                top: 0px;
                left: 0px;
                img{
                    width: 100%;
                    &:hover{
                        cursor: pointer;
                    }
                }
            }
        }
        .selector-box{
            width: 100%;
            height: 0.4vw;
            display: flex;
            flex-direction: row;
            align-items: center;
            position: absolute;
            bottom: -1vw;
            .selector{
                padding: 1.2vw 0.6vw 1.2vw 0;
                &:hover{
                    cursor: pointer;
                    .selector-style{
                        height: 0.3vw;
                        background-color: black;
                        opacity: 1;
                    }
                }
                .selector-style{
                    width: 2.2vw;
                    height: 1px;
                    background-color: rgb(106, 106, 106);
                    opacity: 0.5;
                    transition: 0.3s;
                }
                .selector-style-active{
                    width: 4.5vw;
                    height: 0.3vw;
                    background-color: black;
                    opacity: 1;
                    transition-delay: 0.05s;
                }
            }
        }
        .banner-header{
            width: 100%;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            position: absolute;
            top: -1.4vw;
            left: 0;
            .banner-title{
                padding: 0.1vw 4vw 0.1vw 0.2vw;
                background-color: black;
                font: 0.65vw Geometos;
                color: white;
            }
            .banner-timer{
                margin-right: -8px;
                display: flex;
                flex-direction: row;
                align-items: center;
                .line{
                    width: 9vw;
                    height: 0.5px;
                    background-color: black;
                }
                .timer{
                    width: 0.8vw;
                    height: 0.8vw;
                    border: 1px solid black;
                    position: relative;
                    right: -0.6vw;
                    transition: 0s;
                    .timer-animation{
                        width: 0px;
                        height: 0px;
                        background-color: black;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    }
                    .timer-animation-active{
                        animation: timer-animation-active 3s linear;
                    }
                    @keyframes timer-animation-active {
                        86%{opacity: 1;}
                        88%{opacity: 0;}
                        90%{opacity: 1;}
                        92%{opacity: 0;}
                        94%{opacity: 1;}
                        96%{opacity: 0;}
                        98%{opacity: 1;}
                        100%{width: 0.8vw;;height: 0.8vw;;opacity: 0;}
                    }
                }
                .timer-active{
                    transform: rotate(180deg);
                    transition: 0.8s;
                }
            }
        }
        .banner-next{
            width: 4vw;
            height: 4vw;
            border: {
                right: 1px solid black;
                bottom: 1px solid black;
            };
            position: absolute;
            right: -0.9vw;
            bottom: -0.9vw;
            transition: 0.3s;
            &:hover{
                cursor: pointer;
                right: -1.1vw;
                bottom: -1.1vw;
            }
        }
    }
</style>