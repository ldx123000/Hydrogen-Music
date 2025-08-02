<script setup>
  import { ref } from 'vue'
  const error = ref(false)

  const errorAnimation = () => {
    error.value = true
  }
  defineExpose({errorAnimation})
</script>

<template>
  <div class="check-animation" :class="{'check-error-animation': error}">
    <div class="white-border">
        <div class="check-text">
            <div class="text">/</div>
            <div class="text">/</div>
            <div class="text">/</div>
            <div class="text">/</div>
            <div class="text1">*</div>
            <div class="text2">/</div>
            <div class="text3">*</div>
            <div class="text4">/</div>
            <div class="text5">*</div>
            <div class="text6">/</div>
            <div class="text7">*</div>
            <div class="text8">/</div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .check-animation{
    position: relative;
    opacity: 0;
    overflow: hidden;
    &::after{
        content: '';
        width: 100%;
        height: 100%;
        background-color: black;
        position: absolute;
        z-index: -1;
        top: 0;
        left: 0;
        animation: black-clear 0.6s 1.7s cubic-bezier(.24,1,.48,.98) forwards;
        @keyframes black-clear {
            0%{top: 0;}
            100%{top: 100%;}
        }
    }
    animation: black-back-twinkle 0.2s 0.3s linear forwards;
    @keyframes black-back-twinkle {
        0%{opacity: 1;}
        50%{opacity: 1;}
        60%{opacity: 0;}
        90%{opacity: 0;}
        100%{opacity: 1;}
    }
    .white-border{
        width: 99%;
        height: 99%;
        border: 6px solid rgb(0, 0, 0);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        align-items: center;
        justify-items: center;
        animation: white-border 1s 0.6s ease forwards;
        @keyframes white-border {
            0%{border: 6px solid rgb(255, 255, 255);}
            40%{border: 6px solid rgb(255, 255, 255);width: 94%;height: 94%;}
            75%{border: 6px solid rgb(255, 255, 255);}
            80%{border: 6px solid rgb(0, 0, 0);}
            90%{border: 6px solid rgb(255, 255, 255)}
            95%{border: 6px solid rgb(0, 0, 0);}
            100%{border: 6px solid rgb(0, 0, 0);width: 94%;height: 94%;}
        }
        .check-text{
            width: 100%;
            height: 100%;
            position: relative;
            font: 46px SouceHanSansCN-Heavy;
            color: white;
            animation: font-color 0.2s 1.7s forwards;
            @keyframes font-color {
                100%{color: black;}
            }
            div{
                width: 50%;
                height: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                position: absolute;
                opacity: 0;
            }
            .text{
                animation: text-twinkle 0.1s 0.5s linear forwards;
                @keyframes text-twinkle {
                    0%{opacity: 1;}
                    90%{opacity: 1;}
                    100%{display: none;}
                }
            }
            .text:nth-child(1),.text1,.text2{
                top: 0;
                left: 0;
            }
            .text:nth-child(2),.text3,.text4{
                top: 0;
                right: 0;
            }
            .text:nth-child(3),.text5,.text6{
                bottom: 0;
                left: 0;
            }
            .text:nth-child(4),.text7,.text8{
                bottom: 0;
                right: 0;
            }
            .text1{
                animation: text1 0.1s 0.6s linear forwards;
            }
            .text2{
                animation: text2 0.1s 0.7s linear forwards;
            }
            .text3{
                animation: text1 0.1s 0.8s linear forwards;
            }
            .text4{
                animation: text2 0.1s 0.9s linear forwards;
            }
            .text5{
                animation: text1 0.1s 1s linear forwards;
            }
            .text6{
                animation: text2 0.1s 1.1s linear forwards;
            }
            .text7{
                animation: text1 0.1s 1.2s linear forwards;
            }
            .text8{
                animation: text2 0.1s 1.3s linear forwards;
            }
            @keyframes text1 {
                0%{opacity: 1;}
                80%{opacity: 1;}
                100%{opacity: 0;}
            }
            @keyframes text2 {
                0%{opacity: 0;}
                80%{opacity: 0;}
                100%{opacity: 1;}
            }
        }
    }
  }
  .check-error-animation{
    &::after{
        animation: error2 0.2s 1s linear forwards;
        @keyframes error2 {
            0%{opacity: 1;background-color: red;}
            50%{opacity: 1;}
            60%{opacity: 0;}
            90%{opacity: 0;}
            100%{opacity: 1;background-color: red;}
        }
    }
    .white-border{
        animation: white-border-error 1s 0.6s ease forwards;
        @keyframes white-border-error {
            0%{border: 6px solid rgb(255, 255, 255);}
            40%{border: 6px solid rgb(255, 255, 255);width: 94%;height: 94%;}
            75%{border: 6px solid rgb(255, 255, 255);}
            80%{border: 6px solid rgb(255, 0, 0);}
            90%{border: 6px solid rgb(255, 255, 255)}
            95%{border: 6px solid rgb(255, 0, 0);}
            100%{border: 6px solid rgb(255, 255, 255);width: 94%;height: 94%;}
        }
        .check-text{
            animation: none
        }
    }
  }
</style>