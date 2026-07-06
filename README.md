<br />
<p align="center">

  <h2 align="center" style="font-weight: 600">Hydrogen Music 复活版</h2>

  <p align="center">
    首先感谢原作者的绝佳创意和辛勤付出：<a href="https://github.com/Kaidesuyo/Hydrogen-Music" target="blank"><strong>Hydrogen-Music</strong></a>
    <br />
    🎵 我关注到这个项目是在2024年年初，当时还满怀期望地等待作者重构，但是一年多后的现在，原仓库已经删除，原版已经无法登录账号，不登录账号基本上处于无法使用的状态
    <br />🔄 在这种情况下我决定自己重启这个项目
    <br />
    ⚠️ 如果原作者觉得不妥可以与我联系，我将删除该仓库
    <br />
    <a href="#%EF%B8%8F-安装" target="blank"><strong>📦️ 下载安装包</strong></a>
    <br />
    <br />
  </p>
</p>

## 🌟 主要特性

本项目当前已切换为 **酷狗音乐后端**，前端在原 Hydrogen Music 的基础上做了适配。由于原项目部分能力依赖旧后端接口，并不是所有功能都已经完整移植。

- 支持 **酷狗账号登录**，优先使用酷狗 APP 扫码登录
- 支持 **歌曲搜索、播放、歌词、歌单、专辑、歌手、MV** 等基础音乐功能
- 支持 **歌曲下载**
- 支持 **私人漫游**，对接酷狗私人 FM 能力
- 支持 **桌面歌词**，可拖动/锁定、调整大小，并支持当前/下一句显示和歌词来源切换
- 支持 **评论区浏览**，播放器界面可切换显示歌词/评论区
- 支持 **电台/频道**，目前主要用于收听已收藏的电台节目
- 支持 **深色模式**，可在设置中切换浅色/深色模式
- 支持多系统版本安装包

## ⚠️ 当前限制

以下功能受酷狗后端接口限制，暂未完整移植：

- 云盘：目前支持读取和播放部分云盘歌曲，暂不支持云盘上传、删除和详情接口
- 评论：目前以浏览为主，暂不支持歌曲评论发送、回复、点赞等互动操作
- 收藏：部分收藏能力暂未开放，例如专辑收藏、收藏专辑列表等
- 歌单：部分旧版歌单编辑/操作能力暂未适配
- 旧版网易云相关能力已不再作为主要后端能力维护

  
## 📦️ 安装

访问 [Releases](https://github.com/ldx123000/Hydrogen-Music/releases)
页面下载安装包。

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
