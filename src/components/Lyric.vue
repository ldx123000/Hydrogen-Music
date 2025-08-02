<script setup>
  import { ref, watch, computed, onMounted } from 'vue'
  import { changeProgress, musicVideoCheck, songTime } from '../utils/player'
  import { usePlayerStore } from '../store/playerStore'
  import { storeToRefs } from 'pinia'

  const playerStore = usePlayerStore()
  const { playing, progress, lyric, lyricsObjArr, songList, currentIndex, currentMusic, widgetState, lyricShow, lyricEle, isLyricDelay, lyricSize, tlyricSize, rlyricSize, lyricType, playerChangeSong, lyricInterludeTime, lyricBlur, playerShow, videoIsPlaying } = storeToRefs(playerStore)

  const lyricScroll = ref()
  const lyricScrollArea = ref()
  const heightVal = ref(0)
  const minHeightVal = ref(null)
  const maxHeightVal = ref(null)
  const lineOffset = ref(0)
  const isLyricActive = ref(true)
  const pauseActiveTimer = ref(null)
  const lyricInterval = ref(null)
  const lycCurrentIndex = ref(null)
  const interludeIndex = ref(null)
  const interludeAnimation = ref(false)
  const interludeRemainingTime = ref(null)
  let interludeInTimer = null
  let interludeOutTimer = null

  let initMax = null
  let initOffset = null
  let size = null

  let lyricLastPosition = null

  const regNewLine = /\n/
  const regTime = /\[\d{2}:\d{2}.\d{2,3}\]/

  const formatLyricTime = (time => {
    const regMin = /.*:/
    const regSec = /:.*\./
    const regMs = /\./

    if(time.indexOf('.') == -1) time = time.replace(/(.*):/,'$1.')
    const min = parseInt(time.match(regMin)[0].slice(0, 2))
    let sec = parseInt(time.match(regSec)[0].slice(1, 3))
    const ms = time.slice(time.match(regMs).index + 1, time.match(regMs).index + 3)
    if (min !== 0) {
      sec += min * 60
    }
    return Number(sec + '.' + ms)
  })
  const lyricTypeCheck = (arr, tarr, rarr) => {
    if(arr && lyricType.value.indexOf('noOriginal') != -1) lyricType.value.splice(lyricType.value.indexOf('noOriginal'), 1)
    else if(!arr && lyricType.value.indexOf('noOriginal') == -1) lyricType.value.push('noOriginal')
    if(tarr && lyricType.value.indexOf('noTrans') != -1) lyricType.value.splice(lyricType.value.indexOf('noTrans'), 1)
    else if(!tarr && lyricType.value.indexOf('noTrans') == -1) lyricType.value.push('noTrans')
    if(rarr && lyricType.value.indexOf('noRoma') != -1) lyricType.value.splice(lyricType.value.indexOf('noRoma'), 1)
    else if(!rarr && lyricType.value.indexOf('noRoma') == -1) lyricType.value.push('noRoma')
  }

  const lyricHandle = (arr, tarr, rarr) => {
    lyricTypeCheck(arr, tarr, rarr)
    // console.log(arr)
    // console.log(tarr)
    // console.log(rarr)
    let lyricArr = []
    for (let i = 0; i < arr.length; i++) {
      if(arr[i] == '') continue
      const obj = {}
      const lyctime = arr[i].match(regTime)
      if(!lyctime) continue
      obj.lyric = arr[i].split(']')[1].trim() === '' ? '' : arr[i].split(']')[1].trim()
      if(!obj.lyric) continue
      if(obj.lyric.indexOf('纯音乐') != -1 || obj.time > 4500) {
        lyricArr = [{lyric: "纯音乐，请欣赏", time: 0}, {lyric: "", time: Math.trunc(songList.value[currentIndex.value].dt / 1000)}]
        return lyricArr
      }
      if(tarr && obj.lyric.indexOf('作词') == -1 && obj.lyric.indexOf('作曲') == -1) {
        for (let j = 0; j < tarr.length; j++) {
          if(tarr[j] == '') continue
          if(tarr[j].indexOf(lyctime[0].substring(0, lyctime[0].length - 1)) != -1) {
            obj.tlyric = tarr[j].split(']')[1].trim() === '' ? '' : tarr[j].split(']')[1].trim()
            if(!obj.tlyric) {tarr.splice(j, 1);j--;continue}
            tarr.splice(j, 1)
            break
          }
        }
      }
      if(rarr && obj.lyric.indexOf('作词') == -1 && obj.lyric.indexOf('作曲') == -1) {
        for (let k = 0; k < rarr.length; k++) {
          if(rarr[k] == '') continue
          if(rarr[k].indexOf(lyctime[0].substring(0, lyctime[0].length - 1)) != -1) {
            obj.rlyric = rarr[k].split(']')[1].trim() === '' ? '' : rarr[k].split(']')[1].trim()
            if(!obj.rlyric) {rarr.splice(k, 1);k--;continue}
            rarr.splice(k, 1)
            break
          }
        }
      }
      obj.time = lyctime ? formatLyricTime(lyctime[0].slice(1, lyctime[0].length - 1)) : 0
      if (!(obj.lyric === '')) lyricArr.push(obj)
    }
    function sortBy (field) {
      return (x, y) => {
        return x[field] - y[field]
      }
    }
    return lyricArr.sort(sortBy('time'))
  }

  const getLyric = computed(() => {
    if((!widgetState.value && lyric.value) || (lyric.value && !lyricsObjArr.value)) {
      if(lyric.value.lrc.lyric.indexOf('[') != -1) {
        lyricsObjArr.value = lyricHandle(lyric.value.lrc.lyric.split(regNewLine), (lyric.value.tlyric && lyric.value.tlyric.lyric) ? lyric.value.tlyric.lyric.split(regNewLine) : null, (lyric.value.romalrc && lyric.value.romalrc.lyric) ? lyric.value.romalrc.lyric.split(regNewLine) : null)
        setDefaultStyle()
        return lyricsObjArr.value
      } else {
        let lineArr = lyric.value.lrc.lyric.split(regNewLine)
        lyricsObjArr.value = []
        lineArr.forEach((item, index) => {
          if (item === '') return
          const obj = {}
          obj.active = true
          obj.lyric = item
          obj.time = 0
          if (!(obj.lyric === '')) lyricsObjArr.value.push(obj)
        })
        lyricsObjArr.value.push({lyric: "", time: Math.trunc(songList.value[currentIndex.value].dt / 1000)})
        lyricTypeCheck(true, null, null)
        setDefaultStyle()
        return lyricsObjArr.value
      }
    } else if(!widgetState.value) {
      if(!lyricsObjArr.value) lyricTypeCheck(null, null, null)
      return lyricsObjArr.value
    }
  })  
  const clearLycAnimation = (flag) => {
    if(flag) isLyricDelay.value = false
    for (let i = 0; i < lyricEle.value.length; i++) {
      lyricEle.value[i].style.transitionDelay = 0 + 's'
      if(lyricBlur.value) lyricEle.value[i].firstChild.style.setProperty("filter", "blur(0px)");
    }
    if(flag) {
      const forbidDelayTimer =  setTimeout(() => {
          isLyricDelay.value = true
          clearTimeout(forbidDelayTimer)
      }, 500);
    }
  }
  const setMaxHeight = (change) => {
    if(!lyricsObjArr.value) return
    size = (parseInt((lyricType.value.indexOf('noOriginal') == -1 && lyricType.value.indexOf('original') != -1 ? lyricSize.value : 0)) + parseInt((lyricType.value.indexOf('noTrans') == -1 && lyricType.value.indexOf('trans') != -1 ? tlyricSize.value : 0)) + parseInt((lyricType.value.indexOf('noRoma') == -1 && lyricType.value.indexOf('roma') != -1 ? rlyricSize.value : 0))) * 1.5 + 30
    initMax = lyricsObjArr.value.length * size
    heightVal.value = initMax
    initOffset = -(initMax - 260)
    let offset = (lycCurrentIndex.value + 1) * size
    if(change) {
      lineOffset.value = initOffset - offset
      minHeightVal.value = offset
      maxHeightVal.value = initMax + offset
    } else {
      maxHeightVal.value = initMax
    }
    if(lyricScrollArea.value)
      lyricScrollArea.value.style.height = initMax + 'Px'
  }
  const setDefaultStyle = () => {
    lyric.value = null
    lycCurrentIndex.value = -1
    interludeAnimation.value = false
    lyricEle.value = document.getElementsByClassName('lyric-line')
    initMax = 0
    setMaxHeight(false)
    minHeightVal.value = 0
    lineOffset.value = initOffset
    if(!lyricShow.value && !widgetState.value) {
      const changeTimer = setTimeout(() => {
        lyricShow.value = true
        playerChangeSong.value = false
        clearTimeout(changeTimer)
      }, 400);
    }
  }

  const setLyricActive = () => {
    clearInterval(lyricInterval.value)
    const length = lyricsObjArr.value.length - 1
    lyricInterval.value = setInterval(() => {
      const lastIndex = lycCurrentIndex.value
      const currentSeek = currentMusic.value.seek()
      musicVideoCheck(currentSeek)
      if(!playerShow.value) return
      lycCurrentIndex.value =  lyricsObjArr.value.findIndex((item, index) => {
        if(index != length) {
          return (currentSeek + 0.2) * 1000 < (lyricsObjArr.value[index + 1].time) * 1000
        }
        if(index == length) {
          return (currentSeek + 0.2) * 1000 > item.time * 1000
        }
      })
      if(lastIndex != lycCurrentIndex.value) {
        let offset = null
        if(lyricShow.value && isLyricDelay.value && lyricEle.value) {
          if(lyricBlur.value)
            for (let i = 0, j = lycCurrentIndex.value * 0.4; i < lycCurrentIndex.value; i++) {
              lyricEle.value[i].firstChild.style.setProperty("filter", "blur(" + j + "px)");
              j -= 0.4
            }
          for (let i = lycCurrentIndex.value, j = 0, k = 0; i < lyricEle.value.length; i++) {
            lyricEle.value[i].style.transitionDelay = j + 's'
            j += 0.05
            if(lyricBlur.value) {
              lyricEle.value[i].firstChild.style.setProperty("filter", "blur(" + k + "px)");
              k += 0.4
            }
          }
        }
        for (let i = 0; i <= lycCurrentIndex.value; i++) {
          if(lyricEle.value[i])
            offset += lyricEle.value[i].clientHeight + 10
        }
        lineOffset.value = initOffset - offset
        minHeightVal.value = offset
        maxHeightVal.value = initMax + offset
        let interTime = null
        if(lycCurrentIndex.value != length)
          interTime = lyricsObjArr.value[lycCurrentIndex.value + 1].time - currentSeek
        if( interTime >= lyricInterludeTime.value) {
          interludeIndex.value = lycCurrentIndex.value
          clearTimeout(interludeInTimer)
          clearTimeout(interludeOutTimer)
          interludeInTimer = setTimeout(() => {
            interludeAnimation.value = true
            clearTimeout(interludeInTimer)
          }, 1000);
        } else {
          interludeAnimation.value = false
          clearTimeout(interludeOutTimer)
          interludeOutTimer = setTimeout(() => {
            interludeIndex.value = null
            clearTimeout(interludeOutTimer)
          }, 900);
        }
      }
      if(interludeAnimation.value && (lyricsObjArr.value[lycCurrentIndex.value + 1].time - currentSeek < 1)) {
        interludeAnimation.value = false
        clearTimeout(interludeOutTimer)
        interludeOutTimer = setTimeout(() => {
          interludeIndex.value = null
          clearTimeout(interludeOutTimer)
        }, 900);
      } else if(interludeAnimation.value) {
        interludeRemainingTime.value = Math.trunc((lyricsObjArr.value[lycCurrentIndex.value + 1].time - currentSeek) - 1)
      }
    }, 200);
  }
  const changeProgressLyc = (time, index) => {
    lyricScrollArea.value.style.height = initMax + 'Px'
    if(!playing.value) {
      lycCurrentIndex.value = index
      let offset = (lycCurrentIndex.value + 1) * size
      lineOffset.value = initOffset - offset
      minHeightVal.value = offset
      maxHeightVal.value = initMax + offset
    }
    progress.value = time
    changeProgress(time)
  }
  watch(() => [widgetState.value, playing.value, lyricShow.value, lyricsObjArr.value], () => {
    if(!widgetState.value && playing.value && lyricShow.value && lyricsObjArr.value) {
      if(lyricLastPosition && progress.value < lyricLastPosition - 4) {
        clearLycAnimation(true)
        lyricLastPosition = null
      } else 
        clearLycAnimation(false)
      setLyricActive()
    } else {
      clearInterval(lyricInterval.value)
      lyricLastPosition = progress.value
    }
    if(lyricShow.value && lyricsObjArr.value && lyricEle.value) {
      for (let i = 0; i < lyricEle.value.length; i++) {
        lyricEle.value[i].style.transitionDelay = 0 + 's'
      }
    }
  })
  watch(() => [lyricSize.value, lyricType.value], () => {
    lyricShow.value = false
    if(!lyricShow.value && !widgetState.value) {
      const changeTimer = setTimeout(() => {
        lyricShow.value = true
        setMaxHeight(true)
        clearTimeout(changeTimer)
      }, 500);
    }
  }, {deep: true})
  onMounted(() => {
    lyricScroll.value.addEventListener('wheel', (e) => {

      isLyricActive.value = false
      heightVal.value += (e.wheelDeltaY < 0 ? e.wheelDeltaY + 76 : e.wheelDeltaY - 76)

      if(heightVal.value < minHeightVal.value) heightVal.value = minHeightVal.value
      if(heightVal.value > maxHeightVal.value) heightVal.value = maxHeightVal.value
      
      lyricScrollArea.value.style.height = heightVal.value + 'Px'

      clearTimeout(pauseActiveTimer.value)
      pauseActiveTimer.value = setTimeout(() => {
        isLyricActive.value = true
        lyricScrollArea.value.style.height = initMax + 'Px'
        heightVal.value = initMax
        clearTimeout(pauseActiveTimer.value)
      }, 3000);
    })
  })
</script>

<template>
  <div class="lyric-container">
    <Transition name="fade">
      <div v-show="lyricsObjArr && lyricShow && lyricType.indexOf('original') != -1" class="lyric-area" ref="lyricScroll">
        <div class="lyric-scroll-area" ref="lyricScrollArea"></div>
        <div class="lyric-line" :style="{transform: 'translateY(' + lineOffset + 'Px)'}" v-for="(item, index) in getLyric" v-show="item.lyric">
          <div class="line" @click="changeProgressLyc(item.time, index)" :class="{'line-highlight': index == lycCurrentIndex, 'lyric-inactive': !isLyricActive || item.active}">
            <span class="roma" :style="{'font-size': rlyricSize + 'px'}" v-if="item.rlyric && lyricType.indexOf('roma') != -1">{{item.rlyric}}</span>
            <span class="original" :style="{'font-size': lyricSize + 'px'}" v-if="lyricType.indexOf('original') != -1">{{item.lyric}}</span>
            <span class="trans" :style="{'font-size': tlyricSize + 'px'}" v-if="item.tlyric && lyricType.indexOf('trans') != -1">{{item.tlyric}}</span>
            <div class="hilight" :class="{'hilight-active': index == lycCurrentIndex}" :style="{backgroundColor: videoIsPlaying ? 'rgba(0, 0, 0, 0.8)' : 'black'}"></div>
          </div>
          <div v-if="lycCurrentIndex != -1 && interludeIndex == index" class="music-interlude" :class="{'music-interlude-in': interludeAnimation}">
            <div class="interlude-left">
              <div class="diamond">
                <div class="diamond-inner"></div>
              </div>
            </div>
            <div class="interlude-right">
              <div class="triangle"></div>
              <span class="remaining">THE REMAINING TIME: {{interludeRemainingTime}}</span>
              <div class="interlude-title">
                <span class="title">MUSIC INTERLUDE</span>
                <div class="title-style">
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="49" height="50" viewBox="0 0 49 50" fill="none"><defs><rect id="path_0" x="0" y="0" width="49" height="50"/></defs><g opacity="1" transform="translate(0 0)  rotate(0 24.5 25)"><mask id="bg-mask-0" fill="white"><use xlink:href="#path_0"/></mask><g mask="url(#bg-mask-0)"><path id="line" style="fill:#FFFFFF" transform="translate(46 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(46 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(27 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(27 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(48 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(48 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(19 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:2; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(19 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(34 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(34 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(16 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(16 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(43 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(43 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(23 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:2; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(23 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(12 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:2; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(12 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(5 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:1; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(5 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(8 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:2; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(8 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(30 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:2; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(30 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(1 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:3; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(1 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/><path id="line" style="fill:#FFFFFF" transform="translate(40 0)  rotate(0 0.0005 50)" opacity="1" d=""/><path id="line" style="stroke:#FFFFFF; stroke-width:3; stroke-opacity:1; stroke-dasharray:0 0" transform="translate(40 0)  rotate(0 0.0005 50)" d="M0,0L0,100 "/></g></g></svg>
                </div>
              </div>
              <div class="interlude-progress"></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-show="!lyricsObjArr || lyricType.indexOf('original') == -1" class="lyric-nodata">
          <div class="line1"></div>
          <span class="tip">Lyric-Area</span>
          <div class="line2"></div>
      </div>
    </Transition>

    <span class="song-quality" v-if="songList[currentIndex].type == 'local'">{{songList[currentIndex].sampleRate}}KHz/{{songList[currentIndex].bitsPerSample}}Bits/{{songList[currentIndex].bitrate}}Kpbs</span>
    <span class="song-quality" v-if="songList[currentIndex].level">{{songList[currentIndex].level.sr / 1000}}KHz/{{Math.round(songList[currentIndex].level.br / 1000)}}Kpbs/{{(songList[currentIndex].quality).toUpperCase()}}</span>
    <div class="border border1"></div>
    <div class="border border2"></div>
    <div class="border border3"></div>
    <div class="border border4"></div>
  </div>
</template>

<style scoped lang="scss">
  .lyric-container{
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    .lyric-area{
      width: calc(100% - 3vh);
      height: calc(100% - 3vh);
      overflow: hidden;
      transition: 0.3s cubic-bezier(.30,0,.12,1);
      .lyric-scroll-area{
        width: 100%;
        transition: 0.3s;
      }
      .lyric-line{
        margin-bottom: 10Px;
        width: 100%;
        text-align: left;
        transition: 0.58s cubic-bezier(.4,0,.12,1);
        .line{
          padding: 10Px 130Px 10Px 25Px;
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          transition-duration: 0.6s;
          transition-timing-function: cubic-bezier(.30,0,.12,1);
          user-select: text;
          &:hover{
            cursor: pointer;
            background-color: rgba(0, 0, 0, 0.045);
          }
          &:active{
            transform: scale(0.9);
            filter: blur(0) !important;
          }
          .original, .trans, .roma{
            font: 20Px SourceHanSansCN-Bold;
            font-weight: bold;
            color: black;
            text-align: left;
            display: inline-block;
            transition: 0.5s cubic-bezier(.30,0,.12,1);
          }
          .hilight{
            width: 100%;
            height: 100%;
            background-color: black;
            position: absolute;
            z-index: -1;
            top: 0;
            left: 0;
            transform: translateX(-101%);
            transition: 0.55s cubic-bezier(.30,0,.12,1);
          }
          .hilight-active{
            transform: translateX(0);
            transition: 0.62s cubic-bezier(.30,0,.12,1);
          }
        }
        .lyric-inactive{
          filter: blur(0) !important;
          span{
            transform: scale(1.05);
          }
        }
        .line-highlight{
          transition-duration: 0.4s;
          .original, .trans, .roma{
            transform-origin: left center;
            transform: scale(1.15) translateX(26px);
            color: white;
            transition: 0.4s cubic-bezier(.30,0,.12,1);
          }
        }
        .music-interlude{
          padding-top: 0;
          padding-left: 25Px;
          width: 240Px;
          height: 0;
          opacity: 0;
          transform: scale(0);
          transition: 0.8s cubic-bezier(1,-0.49,.61,.36);
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          position: relative;
          left: 0;
          .interlude-left{
            .diamond{
              width: 28Px;
              height: 28Px;
              border: 2Px solid black;
              transform: rotate(45deg);
              animation: diamond-rotate 1.6s 0.6s cubic-bezier(.30,0,.12,1) infinite;
              position: relative;
              @keyframes diamond-rotate {
                0%{transform: rotate(45deg);}
                50%{transform: rotate(135deg);}
                100%{transform: rotate(135deg);}
              }
              .diamond-inner{
                width: 85%;
                height: 85%;
                background-color: black;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
              }
            }
          }
          .interlude-right{
            margin-left: 15Px;
            width: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            .triangle{
              width: 0;
              height: 0;
              border-top: 6Px solid black;
              border-left: 6Px solid transparent;
              position: absolute;
              top: 1Px;
              right: 0;
            }
            .remaining{
              font: 8Px SourceHanSansCN-Bold;
              color: black;
              white-space: nowrap;
            }
            .interlude-title{
              padding: 0 4Px;
              width: 100%;
              background-color: black;
              display: flex;
              flex-direction: row;
              align-items: center ;
              justify-content: space-between;
              white-space: nowrap;
              .title{
                font: 10Px SourceHanSansCN-Bold;
                color: white;
              }
              .title-style{
                width: 15%;
                height: 8Px;
                overflow: hidden;
              }
            }
            .interlude-progress{
              margin-top: 3Px;
              width: 100%;
              height: 4Px;
              background-color: black;
            }
          }
        }
        .music-interlude-in{
          padding-top: 10Px;
          height: 80Px;
          opacity: 1;
          transform: scale(1);
          transition: 0.8s cubic-bezier(.30,0,.12,1);
        }
      }
    }
    .lyric-area-hidden{
      transition: 0.2s cubic-bezier(.30,0,.12,1);
      transform: scale(0.85);
      opacity: 0;
    }
    .lyric-nodata{
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      position: relative;
      .line1, .line2{
        width: 0;
        height: 0;
        position: absolute;
        background: 
        linear-gradient(
          to bottom right,
          rgba(0, 0, 0, 0) 0%,
          rgba(0, 0, 0, 0) calc(50% - 0.5px),
          rgba(0, 0, 0, 0.8) 50%,
          rgba(0, 0, 0, 0) calc(50% + 0.5px),
          rgba(0, 0, 0, 0) 100%
        );
        animation: nodata-open1 0.8s 0.5s cubic-bezier(.32,.81,.56,.98) forwards;
        @keyframes nodata-open1 {
        0%{width: 0;height: 0;}
        100%{width: 38%;height: 38%;}
        }
      }
      .tip{
        font: 16Px Bender-Bold;
        color: black;
        white-space: nowrap;
        opacity: 0;
        animation: nodata-open2 0.1s 1.3s forwards;
        @keyframes nodata-open2 {
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
      }
      .line1{
        left: 4%;
        bottom: 4%;
      }
      .line2{
        top: 4%;
        right: 4%;
      }
    }
    .song-quality{
      font: 1.5vh Bender-Bold;
      color: black;
      position: absolute;
      bottom: -0.9vh;
      right: 1.5vh;
    }


    $boderPosition: -0.75 + vh;
    .border{
      width: 1.5vh;
      height: 1.5vh;
      border: 1Px solid black;
      position: absolute;
    }
    .border1{
      top: $boderPosition;
      left: $boderPosition;
    }
    .border2{
      top: $boderPosition;
      right: $boderPosition;

    }
    .border3{
      bottom: $boderPosition;
      right: $boderPosition;
      &::after{
        content: '';
        width: 0.5vh;
        height: 0.5vh;
        background-color: black;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%,-50%);
      }
    }
    .border4{
      bottom: $boderPosition;
      left: $boderPosition;
    }
  }
  .fade-enter-active{
    transition: 0.4s cubic-bezier(.3,.79,.55,.99) !important;
  }
  .fade-leave-active {
    transition: 0.2s cubic-bezier(.3,.79,.55,.99) !important;
  }
  .fade-enter-from,
  .fade-leave-to {
    transform: scale(0.85);
    opacity: 0;
  }
</style>