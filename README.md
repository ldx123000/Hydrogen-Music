<br />
<p align="center">

  <h2 align="center" style="font-weight: 600">Hydrogen Music 酷狗概念版</h2>

  <p align="center">
    首先感谢原作者的绝佳创意和辛勤付出：<a href="https://github.com/Kaidesuyo/Hydrogen-Music" target="blank"><strong>Hydrogen-Music</strong></a>
    <br />
    🎵 我关注到这个项目是在2024年年初，当时还满怀期望地等待作者重构，但是一年多后的现在，原仓库已经删除，原版已经无法登录账号，不登录账号基本上处于无法使用的状态
    <br />🔄 在这种情况下我基于原作者项目做了这个改造版，将后端切换为酷狗概念版相关能力
    <br />
    ⚠️ 如果原作者觉得不妥可以与我联系，我将删除该仓库
    <br />
    <a href="#%EF%B8%8F-安装" target="blank"><strong>📦️ 下载 Windows 安装包</strong></a>
    <br />
    <br />
  </p>
</p>

## 项目说明

这是基于原作者 [Hydrogen-Music](https://github.com/Kaidesuyo/Hydrogen-Music) 修改而来的版本，主要改动是将原有后端能力切换为 **酷狗概念版后端**。

由于原项目部分功能依赖旧后端接口，本项目不是原版功能的完整复刻。有些功能已经适配酷狗概念版能力，有些功能暂未移植或只能部分可用。目前仅维护 Windows 版。

## 🌟 当前可用功能

前端保留原 Hydrogen Music 的使用体验，并围绕酷狗概念版后端做了必要适配。目前主要支持：

- 支持 **酷狗账号登录**，优先使用酷狗 APP 扫码登录
- 支持 **歌曲搜索、播放、歌词、歌单、专辑、歌手、MV** 等基础音乐功能
- 支持 **歌曲下载**
- 支持 **私人漫游**，对接酷狗私人 FM 能力
- 支持 **桌面歌词**，可拖动/锁定、调整大小，并支持当前/下一句显示和歌词来源切换
- 支持 **评论区浏览**，播放器界面可切换显示歌词/评论区
- 支持 **电台/频道**，目前主要用于收听已收藏的电台节目
- 支持 **深色模式**，可在设置中切换浅色/深色模式
- 仅提供 Windows 版本安装包

## ⚠️ 当前限制

以下能力受酷狗概念版后端接口限制，暂未完整移植：

- 云盘：目前支持读取和播放部分云盘歌曲，暂不支持云盘上传、删除和详情接口
- 评论：目前以浏览为主，暂不支持歌曲评论发送、回复、点赞等互动操作
- 收藏：部分收藏能力暂未开放，例如专辑收藏、收藏专辑列表等
- 歌单：部分旧版歌单编辑/操作能力暂未适配
- HiFi 输出和 MPV 后端：暂未移植
- 旧版网易云相关能力不再作为主要后端能力维护

  
## 📦️ 安装

访问 [Releases](https://github.com/ldx123000/Hydrogen-Music/releases)
页面下载 Windows 安装包。

## 👷‍♂️ 打包客户端

```shell
# 打包
npm run dist
```

## :computer: 配置开发环境

运行本项目

```shell
# 安装依赖
npm install

# 运行Vue服务
npm run dev

# 运行Electron客户端
npm start
```

## 📜 开源许可

本项目仅供个人学习研究使用，禁止用于商业及非法用途。

基于 [MIT license](https://opensource.org/licenses/MIT) 许可进行开源。

## 灵感来源

基于Hydrogen Music修改而来，感谢[Hydrogen-Music](https://github.com/Kaidesuyo/Hydrogen-Music)。


## 🖼️ 截图

![home][home-screenshot]
![lyric][lyric-screenshot]
![desktop-lyric][desktop-lyric-screenshot]
![comment][comment-screenshot]
![privateFM][privateFM-screenshot]
![dark_mode][dark_mode-screenshot]
![music_video][music_video-screenshot]

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[home-screenshot]: img/home.png
[lyric-screenshot]: img/lyric.png
[desktop-lyric-screenshot]: img/desktop-lyric.png
[comment-screenshot]: img/comment.png
[privateFM-screenshot]: img/privateFM.png
[dark_mode-screenshot]: img/dark_mode.png
[music_video-screenshot]: img/music_video.png
