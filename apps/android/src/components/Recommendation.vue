<script setup>
  import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
  import { playAll } from '../utils/player/lazy';
  import { useRouter } from 'vue-router';
  import { useLibraryStore } from '../store/libraryStore'
  import { useLocalStore } from '../store/localStore';
  import { isLogin } from '../utils/authority';
  import { noticeOpen } from '../utils/dialog';
  import { useIsMobile } from '../composables/useIsMobile';
  const libraryStore = useLibraryStore()
  const localStore = useLocalStore()
  const router = useRouter()
  const isMobile = useIsMobile()
  const recTime = ref('')
  const showMore = ref(false)
  const showMoreTitle = ref('每 日推 荐')

  /**
   * 是否允许「悬停切换标题」。
   *
   * 桌面端用 mouseover/mouseout 把标题在「每 日推 荐」↔「查 看详 情」间切换；
   * 但触摸设备没有悬停——WebView 会在点按时合成一次 mouseover，而 mouseout 永不触发，
   * 于是标题会永久卡在「查看详情」（真机实测反馈）。
   * 因此仅在非移动布局、且设备确实具备悬停能力时才启用切换。
   */
  const hoverCapable = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover)').matches
    : true

  /**
   * 卡片标题的实际显示文本。
   *
   * 桌面端把文字写成 '每 日推 荐' / '查 看详 情'（字间插空格）当作排版装饰，
   * 但手机上字号小、又有一层描边字被关掉，这些空格就变成"字与字之间有缝"，
   * 看起来像对齐出了问题。移动端直接去掉空格。
   */
  const displayTitle = computed(() => (
    isMobile.value ? String(showMoreTitle.value || '').replace(/\s+/g, '') : showMoreTitle.value
  ))
  let dateRefreshTimer = null

  const scheduleDateRefresh = () => {
    if(dateRefreshTimer) clearTimeout(dateRefreshTimer)

    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const delay = Math.max(nextMidnight.getTime() - now.getTime() + 100, 1000)
    dateRefreshTimer = setTimeout(refreshRecommendationDate, delay)
  }

  const refreshRecommendationDate = () => {
    const now = new Date()
    const month = `${now.getMonth() + 1}`.padStart(2, '0')
    const day = `${now.getDate()}`.padStart(2, '0')
    recTime.value = `${month} ${day}`
    scheduleDateRefresh()
  }

  const handleVisibilityChange = () => {
    if(document.visibilityState == 'visible') refreshRecommendationDate()
  }

  onMounted(() => {
    refreshRecommendationDate()
    window.addEventListener('focus', refreshRecommendationDate)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onActivated(refreshRecommendationDate)

  onBeforeUnmount(() => {
    if(dateRefreshTimer) clearTimeout(dateRefreshTimer)
    window.removeEventListener('focus', refreshRecommendationDate)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  const more = (flag) => {
    // 触屏上没有悬停（点按会合成 mouseover 且永不 mouseout），切了就会卡住，直接跳过
    if (isMobile.value || !hoverCapable) return
    if(flag) {
        showMore.value = true
        showMoreTitle.value = '查 看详 情'
    } else {
        showMore.value = false
        showMoreTitle.value = '每 日推 荐'
    }
  }
  const checkRecSongs = () => {
    libraryStore.libraryInfo = null
    localStore.currentSelectedSongs = null
    router.push('/recommend')
  }
  const playRecAll = async () => {
    if(isLogin()) {
        await libraryStore.updateRecommendSongs()
        await playAll('rec', libraryStore.librarySongs)
    } else {
        noticeOpen("请先登录", 2)
        router.push('/login')
    }
  }
</script>

<template>
  <div class="recommendation" @mouseover="more(true)" @mouseout="more(false)" @click="checkRecSongs()">
    <div class="rec-left">
        <svg class="rec-title-border1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="one" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(2 2)  rotate(0 100 0.0004999999999997229)" d="M0,0L200,0 "/><path id="five" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 198)  rotate(0 34.5 0.0005)" d="M0,0L69,0 "/><path id="four" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(70 68)  rotate(0 0.0005 66)" d="M0,132L0,0 "/><path id="直线 1" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(2 0)  rotate(0 0.0005 100)" d="M0,200L0,0 "/><path id="six" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(69 70)  rotate(0 66 0.0005)" d="M0,0L132,0 "/><path id="two" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(198 2)  rotate(0 0.0005 34)" d="M0,0L0,68 "/></g></g></svg>
        <div class="rec-title" :class="{'show-more': showMore}">{{displayTitle}}</div>
        <div class="rec-title-en">DAILY RECOMMENDATION</div>
        <svg class="rec-title-border2" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="0 0 200 200" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(180 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="one" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(2 2)  rotate(0 100 0.0004999999999997229)" d="M0,0L200,0 "/><path id="five" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(0 198)  rotate(0 34.5 0.0005)" d="M0,0L69,0 "/><path id="four" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(70 68)  rotate(0 0.0005 66)" d="M0,132L0,0 "/><path id="直线 1" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(2 0)  rotate(0 0.0005 100)" d="M0,200L0,0 "/><path id="six" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(69 70)  rotate(0 66 0.0005)" d="M0,0L132,0 "/><path id="two" style="stroke:#000000; stroke-width:4; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(198 2)  rotate(0 0.0005 34)" d="M0,0L0,68 "/></g></g></svg>
    </div>
    <div class="rec-middle">
        <div class="rec-play-background">
            <svg class="rec-play" @click.stop="playRecAll()" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="10 -9 217 217" fill="none"><defs><rect id="path_0" x="0" y="0" width="200" height="200"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 100 100)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="play" fill-rule="evenodd" style="fill:#E4EFF2" transform="translate(-5.999999999999972 -2.842170943040401e-14)  rotate(90 99.99999999999997 100)" opacity="1" d="M13.4,150L186.6,150L100,0L13.4,150Z "/><path id="play" style="stroke:#000000; stroke-width:8; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(-5.999999999999972 -2.842170943040401e-14)  rotate(90 99.99999999999997 100)" d="M13.4,150L186.6,150L100,0L13.4,150Z "/></g></g></svg>
            <div class="rec-play-border rec-play-border1"></div>
            <div class="rec-play-border rec-play-border2"></div>
            <div class="rec-play-border rec-play-border3"></div>
            <div class="rec-play-border rec-play-border4"></div>
        </div>
    </div>
    <div class="rec-right">
        <div class="rec-date">{{recTime}}</div>
    </div>
    <div class="rec-background"></div>
  </div>
</template>

<style scoped lang="scss">
  .recommendation{
    width: 27vw;
    height: 13.6vw;
    background-color: rgba(255, 255, 255, 0.35);
    display: flex;
    flex-direction: row;
    position: relative;
    &:hover{
        cursor: pointer;
    }
    .rec-left{
        width: 50%;
        margin-left: 2vw;
        position: relative;
        display: flex;
        align-items: center;
        .rec-title-border1{
            width: 2.2vw;
            height: 2.2vw;
            position: absolute;
            top: 1vw;
            left: 0px;
        }
        .rec-title-border2{
            width: 2.2vw;
            height: 2.2vw;
            position: absolute;
            right: 0px;
            bottom: 1vw;
        }
        .rec-title{
            font: 3.7vw SourceHanSansCN-Heavy;
            // font: 3.7vw Source Han Sans;
            font-weight: bolder;
            color: transparent;
            -webkit-text-stroke-width: 1px;
            -webkit-text-stroke-color: black;
        }
        .show-more{
            animation: show-more 0.1s;
        }
        @keyframes show-more {
                10%{opacity: 0;}
                20%{opacity: 1;}
                30%{opacity: 1;}
                40%{opacity: 0;}
                50%{opacity: 0;}
                60%{opacity: 1;}
                70%{opacity: 1;}
                80%{opacity: 0;}
                90%{opacity: 0;}
                100%{opacity: 1;}
        }
        .rec-title-en{
            font: 0.7vw Gilroy-ExtraBold;
            position: absolute;
            width: 100%;
            text-align: center;
        }
    }
    .rec-middle{
        margin-left: 1vw;
        width: 15%;
        display: flex;
        align-items: center;
        .rec-play-background{
            width: 3.5vw;
            height: 3.5vw;
            background: linear-gradient(135deg, #0000 25%, #000 0, #000 50%, #0000 0, #0000 75%, #000 0);
            background-size:5px 5px;
            opacity: 0.7;
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: rec-play-background 8s linear infinite;
            .rec-play{
                width: 2.5vw;
                height: 2.5vw;
                transition: 0.2s;
                &:hover{
                    transform: scale(1.08);
                    cursor: pointer;
                }
                &:active{
                    transform: scale(1);
                }
            }
            .rec-play-border{
                width: 0.4vw;
                height: 0.4vw;
                background-color: black;
                position: absolute;
            }
            $borderOffset: -0.1vw;
            .rec-play-border1{
                top: $borderOffset;
                left: $borderOffset;
            }
            .rec-play-border2{
                top: $borderOffset;
                right: $borderOffset;
            }
            .rec-play-border3{
                right: $borderOffset;
                bottom: $borderOffset;
            }
            .rec-play-border4{
                left: $borderOffset;
                bottom: $borderOffset;
            }
        }
        @keyframes rec-play-background {
            0%{background-position: 0%;}
            100%{background-position: 100%;}
        }
    }
    .rec-right{
        margin-right: 1.5vw;
        width: 35%;
        display: flex;
        align-items: center;
        .rec-date{
            font: 4.7vw Gilroy-ExtraBold;
        }
    }
    .rec-background{
        width: 0.7vw;
        height: 0.7vw;
        border-radius: 50%;
        background-color: rgba(204, 204, 204, 0.7);
        position: absolute;
        top: 1vw;
        right: 1vw;
    }
  }
</style>
