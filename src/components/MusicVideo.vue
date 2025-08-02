<script setup>
  import { ref, watch } from 'vue'
  import QRCode from 'qrcode'
  import axios from 'axios';
  import { songTime2, loadMusicVideo, unloadMusicVideo } from '../utils/player';
  import VueSlider from 'vue-slider-component'
  import { dialogOpen, noticeOpen } from '../utils/dialog';
  import { useUserStore } from '../store/userStore';
  import { usePlayerStore } from '../store/playerStore';
  import { storeToRefs } from 'pinia';
  
  const userStore = useUserStore()
  const playerStore = usePlayerStore()
  const { addMusicVideo, songId } = storeToRefs(playerStore)
  const toLogin = ref(false)
  const qrKey = ref(null)
  const qrcodeImg = ref(null)
  const checkQRTimer = ref(null)
  const videoUrl = ref(null)
  const currentVideoInfo = ref(null)
  const selectedInfo = ref({})
  const musicTiming = ref(0)
  const videoTiming = ref([0, 0])
  const timingList = ref(null)
  const progress = ref(0)
  const isDownloading = ref(false)
  const headers = {
                'Accept':'*/*',
                'Accept-Encoding':'utf-8',  //这里设置返回的编码方式 设置其他的会是乱码
                'Accept-Language':'zh-CN,zh;q=0.8',
                'Content-Type': 'application/json;charset=UTF-8',
                'referer': 'https://www.bilibili.com/'
            }

  const loginOrLogout = () => {
    if(!userStore.biliUser) {
        toLogin.value = true
        if(qrKey.value) {
            checkQRCode().then(code => {
                if(code == -4 || code == -5) checkInterval()
                else getQRCode()
            })
        } else {
            getQRCode()
        }
    } else {
        localStorage.removeItem('Sessdata')
        userStore.biliUser = null
        qrKey.value = null
    }
  }
  const getQRCode = () => {
    windowApi.getRequestData({url: 'http://passport.bilibili.com/qrcode/getLoginUrl', option: {headers: headers}}).then(result => {
        qrKey.value = result.data.oauthKey
        let opts = {
            errorCorrectionLevel: 'Q',
            type: "image/png",
            width: 192,
            height: 192,
            color: {
                dark: "#000000",
                light: "#FFFFFF"
            }
        };
        QRCode.toDataURL(result.data.url, opts, (err, url) => {
            if(err) throw err
            qrcodeImg.value = url
        })
    })
    clearInterval(checkQRTimer.value)
    checkInterval()
  }
  const checkQRCode = async () => {
    const result = await axios.post('https://passport.bilibili.com/qrcode/getLoginInfo?oauthKey=' + qrKey.value)
    return result.data.data
}
  const checkInterval = () => {
    checkQRTimer.value = setInterval(() => {
        checkQRCode().then(code => {
            if(!code) {getQRCode(); return}
            if(code == -1) {getQRCode(); return}
            else if(code == -2) {getQRCode(); return}
            else if(code == -4) return
            else if(code == -5) return
            else loginHandle(code)
        })
    }, 1000);
  }
  const loginHandle = async (data) => {
    closeLogin()
    if(selectedInfo.value.bvid) {search()}
    localStorage.setItem('Sessdata', data.url.match(/SESSDATA=(\S*)&bili_jct/)[1])
    headers.cookie = 'SESSDATA=' + localStorage.getItem('Sessdata')  + ';'
    const userInfo = await windowApi.getRequestData({url: 'http://api.bilibili.com/nav', option: {headers: headers}})
    if(userInfo.code == 0) {
        noticeOpen('登录成功', 2)
        userStore.biliUser = userInfo.data
    } else {
        noticeOpen('登录失败', 2)    
        loginOrLogout()
    }
  }
  const closeLogin = () => {
    toLogin.value = false;
    clearInterval(checkQRTimer.value)
  }
  const search = async () => {
    if(videoUrl.value == '' || !videoUrl.value) {
        noticeOpen("请输入视频链接或BV号！", 2)
        return
    } else {
        let bv = checkUrl()
        if(bv) {
            setDefault()
            selectedInfo.value = {bvid: bv}
            if(localStorage.getItem('Sessdata')) headers.cookie = 'SESSDATA=' + localStorage.getItem('Sessdata') + ';'
            else headers.cookie = ''
            const videoInfo = await windowApi.getRequestData({url: 'http://api.bilibili.com/x/web-interface/view', option: {headers: headers,params: {bvid: bv}}})
            if(videoInfo.code == 0) {
                currentVideoInfo.value = videoInfo.data
                const videoData = await windowApi.getRequestData({url: 'http://api.bilibili.com/x/player/playurl', option: {headers: headers,params: {bvid: bv, cid: currentVideoInfo.value.cid, fourk: 1, fnval: 80}}})
                currentVideoInfo.value.quality = videoData.data.accept_description
                if(currentVideoInfo.value.pages.length == 1) {
                    currentVideoInfo.value.video = videoData.data.dash.video
                    selectedInfo.value.part = currentVideoInfo.value.cid
                }
            } else noticeOpen('获取视频失败', 3)
        } else {
            noticeOpen("请输入正确的链接或BV号！", 2)
        }
    }
  }
  const checkUrl = () => {
      if(videoUrl.value.indexOf('video/BV') != -1) return videoUrl.value.split('/')[4]
      else if(videoUrl.value.indexOf('BV') != -1 && videoUrl.value[0] == 'B') return videoUrl.value
      else return false
  }
  const setDefault = () => {
    musicTiming.value = 0
    videoTiming.value = [0, 0]
    timingList.value = null
  }
  const selectPart = async (cid) => {
    setDefault()
    selectedInfo.value.part = cid
    if(localStorage.getItem('Sessdata')) headers.cookie = 'SESSDATA=' + localStorage.getItem('Sessdata')  + ';'
    const videoData = await windowApi.getRequestData({url: 'http://api.bilibili.com/x/player/playurl', option: {headers: headers,params: {bvid: selectedInfo.value.bvid, cid: cid, fourk: 1, fnval: 80}}})
    currentVideoInfo.value.quality = videoData.data.accept_description
    currentVideoInfo.value.video = videoData.data.dash.video
    currentVideoInfo.value.duration = videoData.data.dash.duration
  }
  const selectQuality = (item, index) => {
    if(!localStorage.getItem('Sessdata')) {
        if(item != '流畅 360P' && item != '清晰 480P') {
            noticeOpen('该清晰度需要登录账号', 2)
            return
        }
    } else if(!userStore.biliUser.vipStatus) {
        if(item != '流畅 360P' && item != '清晰 480P' && item != '高清 720P' && item != '高清 1080P') {
            noticeOpen('该清晰度需要大会员', 2)
            return
        }
    }
    selectedInfo.value.quality = item
    selectedInfo.value.qn = index
  }
  watch(() => [musicTiming.value, videoTiming.value], () => {
    const vInterval = videoTiming.value[1] - videoTiming.value[0]
    const mInterval = addMusicVideo.value.dt - musicTiming.value
    if(vInterval > mInterval)
        videoTiming.value = [videoTiming.value[0], (videoTiming.value[1] -= vInterval- mInterval)]
  })
  const addTiming = () => {
    if((videoTiming.value[1] - videoTiming.value[0]) <= 3) {
        noticeOpen('视频播放段需大于3秒', 2)
        return
    }
    const start = musicTiming.value
    const end = musicTiming.value + videoTiming.value[1] - videoTiming.value[0]
    if(timingList.value == null){
        timingList.value = [{start: start, end: end, videoTiming: videoTiming.value[0]}]
    } else {
        for(let i = 0; i < timingList.value.length; i++){
            if (!(((start < timingList.value[i].start) && (end < timingList.value[i].start)) || ((start > timingList.value[i].end) && (end > timingList.value[i].end)))){
                noticeOpen('该时间段已存在视频', 2)
                return;
            }
        }
        timingList.value.push({start: start, end: end, videoTiming: videoTiming.value[0]})
    }
    noticeOpen('添加时间段成功', 1)
    sortList()
  }
  const sortList = () => {
    timingList.value.sort((a, b) => a.start - b.start)
  }
  const deleteTiming = (index) => {
    timingList.value.splice(index, 1)
    if(timingList.value.length == 0) timingList.value = null
  }
  const addConfirm = () => {
    if(isDownloading.value) {
        cancelDownload()
        return
    }
    if(addMusicVideo.value.isSave)
        dialogOpen('确认添加', '本歌曲在本地已保存有视频记录，继续添加将覆盖旧数据，您确定吗？', addVideo)
    else
        addVideo(true)
  }
  const addVideo = async (flag) => {
    if(!flag) return
    isDownloading.value = true
    noticeOpen('开始添加，请稍后', 2)
    if(localStorage.getItem('Sessdata')) headers.cookie = 'SESSDATA=' + localStorage.getItem('Sessdata')  + ';'
    console.log(currentVideoInfo.value)
    console.log(selectedInfo.value)
    const urlIndex = selectedInfo.value.qn - (currentVideoInfo.value.quality.length - currentVideoInfo.value.video.length / 2)
    console.log(urlIndex)
    windowApi.getBiliVideo({url: currentVideoInfo.value.video[urlIndex].baseUrl, option: {headers: headers, params: {id: addMusicVideo.value.id, bv: selectedInfo.value.bvid, cid: selectedInfo.value.part, quality: selectedInfo.value.quality, qn: selectedInfo.value.qn, timing: JSON.stringify(timingList.value)}}}).then(result => {
        isDownloading.value = false
        if(result == 'noSavePath') {
            noticeOpen('请先在设置中设置音乐视频缓存目录', 2)
            return
        } else if(result == 'failed') {
            noticeOpen('添加失败', 2)
            return
        } else if(result == 'cancel') {
            noticeOpen('已取消缓存', 3)
            return
        } else if(result == 'success') {
            noticeOpen('添加成功', 2)
            if(songId.value == addMusicVideo.value.id) loadMusicVideo(addMusicVideo.value.id)
            addMusicVideo.value = null
        }
        progress.value = 0
    })
    
  }
  const cancelDownload = () => {
    windowApi.cancelDownloadMusicVideo()
    isDownloading.value = false
    progress.value = 0
  }
  const editTiming = (m1, v1, v2) => {
    musicTiming.value = m1
    videoTiming.value = [v1, v2]
  }
  const deleteConfirm = () => {
      if(addMusicVideo.value.isSave) {
        dialogOpen('确认删除', '本歌曲在本地已保存有视频记录，您确定要删除吗？若需要删除本地文件请前往设置。', deleteVideo)
      } else {
        setDefault()
        currentVideoInfo.value = null
        selectedInfo.value = {}
        videoUrl.value = null
      }
  }
  const deleteVideo = (flag) => {
    if(flag) {
        windowApi.deleteMusicVideo(addMusicVideo.value.id).then(result => {
            if(result) {
                noticeOpen('删除成功', 2)
                setDefault()
                currentVideoInfo.value = null
                selectedInfo.value = {}
                videoUrl.value = null
                addMusicVideo.value.isSave = false
                if(songId.value == addMusicVideo.value.id) unloadMusicVideo()
            }
            else noticeOpen('删除失败', 2)
        })
    }
  }
  const loadData = () => {
    if(addMusicVideo.value != null) {
        windowApi.musicVideoIsExists({id: addMusicVideo.value.id, method: 'get'}).then((result) => {
            if(result) {
                addMusicVideo.value.isSave = true
                videoUrl.value = result.data.bv
                search().then(() => {
                    selectPart(result.data.cid)
                    timingList.value = result.data.timing
                })
                selectedInfo.value = {
                    bvid: result.data.bv,
                    quality: result.data.quality,
                    qn: result.data.qn
                }
            }
        })
    }
  }
  windowApi.downloadVideoProgress((event, value) => {
    progress.value = value
  })
  loadData()

  const formatTime = (time) => {
    let min = Math.floor(time / 60)
    let sec = Math.floor(time % 60)
    if(sec == 60) {
        sec = 0
        min++
    }
    if(min < 10) min = '0' + min
    if(sec < 10) sec = '0' + sec
    if(time.toFixed(1).indexOf('.') != -1)
        sec += time.toFixed(1).split('.')[1]
    return min + ':' + sec
  }
  const close = () => {
    if(isDownloading.value) cancelDownload()
    addMusicVideo.value = null
  }
</script>
<template>
  <div class="music-video">
    <div class="set-video-container">
        <svg t="1671966797621" class="close" @click="close()" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1965" width="200" height="200" data-v-4ab3cf75=""><path d="M576 512l277.333333 277.333333-64 64-277.333333-277.333333L234.666667 853.333333 170.666667 789.333333l277.333333-277.333333L170.666667 234.666667 234.666667 170.666667l277.333333 277.333333L789.333333 170.666667 853.333333 234.666667 576 512z" fill="#ffffff" p-id="1966" data-v-4ab3cf75=""></path></svg>
        <div class="set-video-title">
            <span class="title-cn">添加视频</span>
            <span class="title-en">ADD VIDEO FOR <span style="color: pink;">{{addMusicVideo ? addMusicVideo.name : 'Muisc'}}</span></span>
        </div>
        <div class="set-video-info">
            <div class="bili-account">
                <div class="account-info">
                    <span class="info-title">BILIBILI ACCOUNT</span>
                    <div class="info" v-if="userStore.biliUser">
                        <img :src="userStore.biliUser.face + '@100w'" alt="">
                        <div class="my-info">
                            <span class="username">{{userStore.biliUser.uname}}</span>
                            <span class="vip">大会员：{{userStore.biliUser.vipStatus ? '已激活': '未激活'}}</span>
                        </div>
                        <div class="info-back" :class="{'info-back2': !userStore.biliUser.vipStatus}">BILIBILI VIP</div>
                    </div>
                    <div class="no-info" v-if="!userStore.biliUser">NONE</div>
                </div>
                <div class="account-button" @click="loginOrLogout()">{{userStore.biliUser ? '退出' : '登录'}}</div>
            </div>
            <div class="video-url">
                <input v-model="videoUrl" type="text" placeholder="请输入视频链接或BV号" spellcheck="false">
            </div>
            <div class="video-add">
                <div class="video-info">
                    <div class="video-quality" v-if="selectedInfo.quality">
                        <span class="quality-title">QUALITY</span>
                        <span class="quality">{{selectedInfo.quality.substring(3)}}</span>
                    </div>
                    <div class="info-title-cn">视频信息</div>
                    <div class="info-title-en">VIDEO INFO</div>
                    <Transition name="fade">
                        <div class="video" v-if="currentVideoInfo">
                            <div class="info">
                                <img :src="currentVideoInfo.pic  + '@100h'" alt="">
                                <div class="other">
                                    <span class="info-name">{{currentVideoInfo.title}}</span>
                                    <span class="info-author">UP：{{currentVideoInfo.owner.name}}</span>
                                </div>
                            </div>
                            <div class="more-video" v-if="currentVideoInfo.pages.length != 1">
                                <div class="video-p" :class="{'opt-selected': selectedInfo.part == item.cid}" v-for="(item, index) in currentVideoInfo.pages">
                                    <span class="p-name" :title="item.part" @click="selectPart(item.cid)">{{item.part}}</span>
                                </div>
                            </div>
                            <div class="video-all-quality" v-if="currentVideoInfo.quality">
                                <div class="quality-list" :class="{'opt-selected': selectedInfo.qn == index}" v-for="(item, index) in currentVideoInfo.quality">
                                    <span class="quality-opt" :title="item" @click="selectQuality(item, index)">{{item}}</span>
                                </div>
                            </div>
                        </div>
                    </Transition>
                    <Transition name="fade">
                        <div class="no-video" v-if="!currentVideoInfo">NONE</div>
                    </Transition>
                </div>
                <div class="video-other">
                    <div class="video-search" @click="search()">搜索</div>
                    <div class="video-delete" @click="deleteConfirm()">删除</div>
                </div>
            </div>
            <Transition name="fade">
                <div class="video-timing" v-if="addMusicVideo && currentVideoInfo && selectedInfo.part && selectedInfo.quality">
                    <div class="timing-axis">
                        <span class="music-timing-label">视频插入点</span>
                        <div class="timing-select">
                            <vue-slider class="music-timing-progress" v-model="musicTiming" :min="0" :max="addMusicVideo.dt" :interval="0.1" :process="false" :tooltip="'always'" :tooltipPlacement="'bottom'" :tooltip-formatter="formatTime" :lazy="true" :drag-on-click="true">
                                <template v-slot:dot="{ musicTiming }">
                                    <div :class="['custom-dot']"></div>
                                </template>
                            </vue-slider>
                            <span class="progress-label">音频轴</span>
                        </div>
                        <span class="time-label">{{songTime2(addMusicVideo.dt)}}</span>
                    </div>
                    <div class="timing-axis">
                        <span class="music-timing-label">视频播放段</span>
                        <div class="timing-select">
                            <vue-slider class="music-timing-progress" v-model="videoTiming" :min="0" :max="currentVideoInfo.duration" :min-range="0" :max-range="addMusicVideo.dt - musicTiming" :interval="0.1" :tooltip="'always'" :tooltipPlacement="'bottom'" :tooltip-formatter="formatTime" :lazy="true" :drag-on-click="true">
                                <template v-slot:dot="{ videoTiming }">
                                    <div :class="['custom-dot']"></div>
                                </template>
                            </vue-slider>
                            <span class="progress-label">视频轴</span>
                        </div>
                        <span class="time-label">{{songTime2(currentVideoInfo.duration)}}</span>
                    </div>
                </div>
            </Transition>
            <Transition name="fade">
                <div class="add-timing" v-if="selectedInfo.part && selectedInfo.quality" @click="addTiming()">
                    <span class="add-title">添加该时间段</span>
                </div>
            </Transition>
        </div>
        <Transition name="fade">
            <div class="timing-container" v-if="timingList && currentVideoInfo">
                <div class="timing-list">
                    <TransitionGroup name="list" tag="div">
                        <div class="time" v-for="(item, index) in timingList" :key="item">
                            <span @click="editTiming(item.start, item.videoTiming, (item.videoTiming + item.end - item.start))">M: {{formatTime(item.start)}} - {{formatTime(item.end)}}<br>V: {{formatTime(item.videoTiming)}} - {{formatTime(item.videoTiming + item.end - item.start)}}</span>
                            <svg @click="deleteTiming(index)" v-if="!isDownloading" t="1670569532229" class="item-delete" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2597" width="200" height="200" data-v-d79774b1=""><path d="M558.933333 529.066667l285.866667 285.866666-29.866667 29.866667-285.866666-285.866667-285.866667 285.866667-29.866667-29.866667 285.866667-285.866666L213.333333 243.2l29.866667-29.866667 285.866667 285.866667L814.933333 213.333333l29.866667 29.866667-285.866667 285.866667z" fill="#ffffff" p-id="2598" data-v-d79774b1=""></path></svg>
                        </div>
                    </TransitionGroup>
                </div>
                <div class="confirm" @click="addConfirm()">
                    <div class="progress" :style="{left: -(100 - progress) + '%'}" v-if="isDownloading"></div>
                    <span>{{!isDownloading ? '添加至歌曲' : '缓存中' + progress + '%'}}</span>
                </div>
            </div>
        </Transition>
        <Transition name="fade">
            <div class="bili-login" v-show="toLogin">
                <div class="login-mask" @click.stop="closeLogin()"></div>
                <div class="login">
                    <span class="login-title">BILIBILI ACCOUNT LOGIN</span>
                    <img :src="qrcodeImg" alt="">
                    <span class="qr-tip">使用哔哩哔哩手机客户端扫描登录</span>
                </div>
            </div>
        </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .set-video-container{
    width: 450px;
    height: 570px;
    background-color: rgba(44, 50, 51, 1);
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 999;
    transform: translate(-50%, -50%);
    .close{
        width: 25px;
        height: 25px;
        position: absolute;
        top: 16px;
        right: 15px;
        transition: 0.2s;
        &:hover{
            cursor: pointer;
            opacity: 0.8;
        }
        &:active{
            opacity: 0.6;
        }
    }
    .set-video-title{
        padding: 10px 15px;
        background-color: rgba(0, 0, 0, 0.75);
        display: flex;
        flex-direction: column;
        text-align: left;
        color: white;
        .title-cn{
            font: 18px SourceHanSansCN-Bold;
            line-height: 18px;
        }
        .title-en{
            width: 90%;
            font: 16px Bender-Bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }
    .set-video-info{
        padding: 10px 15px;
        .bili-account{
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            .account-info{
                width: 80%;
                height: 80px;
                background-color: rgba(0, 0, 0, 0.55);
                position: relative;
                overflow: hidden;
                .info-title{
                    padding-left: 4px;
                    width: 100%;
                    height: 12px;
                    background-color: rgba(0, 0, 0, 0.75);
                    font: 8px Bender-Bold;
                    color: rgba(255, 255, 255, 0.8);
                    line-height: 12px;
                    text-align: left;
                    position: absolute;
                    top: 0;
                    left: 0;
                }
                .info{
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    img{
                        margin-top: 9px;
                        margin-left: 14px;
                        width: 45px;
                        height: 45px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .my-info{
                        margin-top: 9px;
                        margin-left: 12px;
                        display: flex;
                        flex-direction: column;
                        text-align: left;
                        font: 11px SourceHanSansCN-Bold;
                        color: rgba(255, 255, 255, 0.9);
                    }
                    .info-back{
                        font: 8px Bender-Bold;
                        color: rgba(255, 255, 255, 0.8);
                        position: absolute;
                        right: 30px;
                        bottom: 8px;
                        &::after{
                            content: '';
                            width: 14px;
                            height: 3px;
                            background-color: rgba(255, 192, 203, 0.9);
                            position: absolute;
                            right: -20px;
                            bottom: 3px;
                        }
                    }
                    .info-back2{
                        &::after{
                            background-color: rgba(255, 255, 255, 0.6);
                        }
                    }
                }
                .no-info{
                    font: 14px Bender-Bold;
                    color: rgba(255, 255, 255, 0.8);
                    line-height: 80px;
                }
            }
            .account-button{
                width: 18%;
                height: 80px;
                background-color: rgba(0, 0, 0, 0.55);
                font: 14px SourceHanSansCN-Bold;
                color: rgba(255, 255, 255, 0.9);
                line-height: 80px;
                transition: 0.2s;
                &:hover{
                    cursor: pointer;
                    background-color: rgba(0, 0, 0, 0.35);
                }
                &:active{
                    background-color: rgba(0, 0, 0, 0.65);
                }
            }
        }
        .video-url{
            margin-top: 10px;
            input{
                padding: 0 12px;
                width: 100%;
                height:30px;
                font: 12px Bender-Bold;
                color: rgba(255, 255, 255, 0.8);
                outline: none;
                border: none;
                background-color: rgba(0, 0, 0, 0.55);
                &::placeholder{
                    font: 12px SourceHanSansCN-Bold;
                }
            }
        }
        .video-add{
            width: 100%;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            .video-info{
                margin-top: 10px;
                padding: 10px 15px 10px 15px;
                width: 80%;
                background-color: rgba(0, 0, 0, 0.55);
                position: relative;
                .video-quality{
                    display: flex;
                    flex-direction: column;
                    text-align: right;
                    transform: translate(-10px);
                    opacity: 0;
                    animation: video-quality-in 0.1s forwards;
                    @keyframes video-quality-in {
                        0%{transform: translate(-5px);}
                        100%{transform: translate(0px);opacity: 1;}
                    }
                    .quality-title{
                        font: 10px Bender-Bold;
                        color: rgba(255, 255, 255, 0.8);
                    }
                    .quality{
                        font: 22px Bender-Bold;
                        color: rgba(255, 255, 255, 0.9);
                    }
                    position: absolute;
                    top: 10px;
                    right: 15px;
                }
                .info-title-cn{
                    font: 20px SourceHanSansCN-Bold;
                    color: rgba(255, 255, 255, 0.9);
                    text-align: left;
                    line-height: 22px;
                }
                .info-title-en{
                    font: 10px Bender-Bold;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: left;
                }
                .video{
                    margin-top: 6px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    .info{
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        img{
                            margin-right: 10px;
                            height: 60px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                        }
                        .other{
                            display: flex;
                            flex-direction: column;
                            text-align: left;
                            .info-name{
                                margin-bottom: 4px;
                                font: 12px SourceHanSansCN-Bold;
                                color: rgba(255, 255, 255, 0.9);
                                overflow: hidden;
                                display: -webkit-box;
                                -webkit-box-orient: vertical;
                                -webkit-line-clamp: 2;
                                word-break: break-all;
                            }
                            .info-author{
                                font: 10px SourceHanSansCN-Bold;
                                color: rgba(255, 255, 255, 0.6);
                                overflow: hidden;
                                display: -webkit-box;
                                -webkit-box-orient: vertical;
                                -webkit-line-clamp: 1;
                                word-break: break-all;
                            }
                        }
                    }
                    .more-video, .video-all-quality{
                        margin-top: 10px;
                        width: 100%;
                        padding-bottom: 6px;
                        overflow-x: auto;
                        overflow-y: hidden;
                        display: flex;
                        flex-direction: row;
                        &::-webkit-scrollbar {
                            height: 4px;
                        }
                        &::-webkit-scrollbar-thumb {
                            background: rgba(255, 255, 255, 0.2);
                            &:hover{
                                cursor: pointer;
                                background-color: rgba(255, 255, 255, 0.4);
                            }
                        }
                        .video-p, .quality-list{
                            margin-right: 10px;
                            padding: 0 4px;
                            width: 70px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            &:hover{
                                cursor: pointer;
                                background-color: rgba(255, 255, 255, 0.05);
                            }
                            .p-name, .quality-opt{
                                font: 10px SourceHanSansCN-Bold;
                                color: rgba(255, 255, 255, 0.6);
                                line-height: 30px;
                                overflow: hidden;
                                white-space: nowrap;
                                text-overflow: ellipsis;
                                display: block;
                            }
                        }
                        .opt-selected{
                            background-color: rgba(255, 255, 255, 0.1) !important;
                        }
                    }
                }
                .no-video{
                    width: 100%;
                    height: 100%;
                    font: 14px Bender-Bold;
                    color: rgba(255, 255, 255, 0.8);
                    line-height: 200px;
                    position: absolute;
                    top: 0;
                    left: 0;
                }
            }
            .video-other{
                width: 18%;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                .video-search{
                    margin: 10px 0;
                }
                .video-search, .video-delete{
                    width: 100%;
                    height: 48%;
                    background-color: rgba(0, 0, 0, 0.55);
                    font: 14px SourceHanSansCN-Bold;
                    color: rgba(255, 255, 255, 0.9);
                    line-height: 95px;
                    transition: 0.2s;
                    &:hover{
                    cursor: pointer;
                        background-color: rgba(0, 0, 0, 0.35);
                    }
                    &:active{
                        background-color: rgba(0, 0, 0, 0.65);
                    }
                }
            }
        }
        .video-timing{
            margin-top: 10px;
            .timing-axis{
                display: flex;
                flex-direction: row;
                align-items: flex-start;
                &:first-child{
                    margin-bottom: 15px;
                }
                .music-timing-label{
                    margin-right: 8px;
                    font: 12px SourceHanSansCN-Bold;
                    color: rgba(255, 255, 255, 0.9);
                    white-space: nowrap;
                }
                .timing-select{
                    margin-top: 8px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    .music-timing-progress{
                        width: 100% !important;
                        height: 4px !important;
                        background-color: rgba(0, 0, 0, 0.4);
                        transition: 0.2s;
                    }
                    .progress-label{
                        margin-top: 5px;
                        font: 10px SourceHanSansCN-Bold;
                        color: rgba(255, 255, 255, 0.7);
                    }
                }
                .time-label{
                    margin-top: 1px;
                    margin-left: 8px;
                    font: 12px Bender-Bold;
                    color: rgba(255, 255, 255, 0.7);
                }
            }
            .custom-dot {
                width: 100%;
                height: 100%;
                border-radius: 0;
                background-color: rgb(189, 189, 189);
                transition: all .3s;
            }
        }
        .add-timing{
            margin-top: 15px;
            padding: 5px;
            width: 100%;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background-color: rgba(0, 0, 0, 0.55);
            position: relative;
            &:hover{
                cursor: pointer;
                background-color: rgba(0, 0, 0, 0.4);
            }
            &:active{
                background-color: rgba(0, 0, 0, 0.2);
            }
            .add-title{
                font: 12px SourceHanSansCN-Bold;
                color: rgba(255, 255, 255, 0.7);
            }
        }
    }
  }
  .timing-container{
    width: 160px;
    position: absolute;
    right: -170px;
    bottom: 0;
    .confirm{
        margin-top: 10px;
        width: 100%;
        padding: 8px 12px;
        background-color: rgba(44, 50, 51, 1);
        font: 12px SourceHanSansCN-Bold;
        color: rgba(255, 255, 255, 0.8);
        position: relative;
        overflow: hidden;
        &::before{
            content: '';
            width: 4px;
            height: 4px;
            background-color: white;
            position: absolute;
            top: 2px;
            left: -4px;
            z-index: 1;
            transition: 0.1s ease-out;
        }
        &::after{
            content: '';
            width: 4px;
            height: 4px;
            background-color: white;
            position: absolute;
            bottom: 2px;
            right: -4px;
            z-index: 1;
            transition: 0.1s ease-out;
        }      
        &:hover{
            cursor: pointer;
            background-color: rgb(26, 26, 26);
            &::before{
                left: calc(100% - 6px);
                transition: 0.15s ease-out;
            }
            &::after{
                right: calc(100% - 6px);
                transition: 0.15s ease-out;
            }
        }
        &:active{
            background-color: rgb(61, 68, 70);
        }
        .progress{
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            position: absolute;
            top: 0;
            left: 0;
            z-index: 0;
            transition: 0.2s;
        }
    }
    .timing-list{
        width: 100%;
        max-height: 432px;
        overflow: auto;
        &::-webkit-scrollbar{
            display: none;
        }
        .time{
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            margin-top: 10px;
            padding: 8px 12px;
            background-color: rgba(44, 50, 51);
            font: 12px Bender-Bold;
            color: rgba(255, 255, 255, 0.8);
            span{
                &:hover{
                    cursor: pointer;
                }
            }
            svg{
                width: 18px;
                height: 18px;
                &:hover{
                    cursor: pointer;
                    opacity: 0.8;
                }
            }
        }
    }
  }
  .bili-login{
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    .login-mask{
        width: 100%;
        height: 100%;
        background-color: rgb(0, 0, 0, 0.15);
        position: absolute;
        top: 0;
        left: 0;
    }
    .login{
        width: 230px;
        height: 230px;
        background-color: rgba(16, 16, 18, 1);
        box-shadow: 0 0 16px 4px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        opacity: 0;
        animation: login 0.15s cubic-bezier(.3,.79,.55,.99) forwards;
        @keyframes login {
            18%{opacity: 0;}
            20%{opacity: 1;}
            38%{opacity: 1;}
            40%{opacity: 0;}
            58%{opacity: 0;}
            60%{opacity: 1;}
            78%{opacity: 1;}
            80%{opacity: 0;}
            98%{opacity: 0;}
            100%{opacity: 1;}
        }
        .login-title{
            padding-left: 4px;
            width: 100%;
            height: 16px;
            background-color: rgba(0, 0, 0, 0.75);
            font: 10px Bender-Bold;
            color: rgba(255, 255, 255, 0.8);
            line-height: 16px;
            text-align: left;
            position: absolute;
            top: 0;
            left: 0;
        }
        img{
            margin-top: 16px;
            width: 150px;
            height: 150px;
        }
        .qr-tip{
            margin-top: 10px;
            font: 10px SourceHanSansCN-Bold;
            color: rgba(255, 255, 255, 0.8);
        }
    }
  }
  .video-player{
    width: 200px;
    height: 350px;
    position: absolute;
    top: 100px;
  }
  .fade-enter-active,
  .fade-leave-active {
    transition: 0.2s;
  }
  .fade-enter-from,
  .fade-leave-to {
    transform: scale(0.9);
    opacity: 0;
  }

  .list-move,
  .list-enter-active,
  .list-leave-active {
    transition: all 0.2s ease;
  }
  .list-enter-from,
  .list-leave-to {
    opacity: 0;
  }
  .list-leave-active {
    position: absolute;
  }
</style>