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

- 重做 **登录** 功能
- 修复 **歌曲下载** 功能
- 修复 **音乐视频** 功能，现在支持在线音乐播放视频
- 修复 **云盘** 功能，现在可以正常在云盘进行上传/删除操作，内存管理一切正常
- 新增 **私人漫游** 功能，可以像原版预期那样探索音乐世界。
- 新增 **桌面歌词** 功能，播放器界面可打开独立桌面歌词窗口（可拖动/锁定、可调整大小），支持显示当前/下一句，右键菜单可切换歌词来源（自动/原文/翻译/罗马音）、锁定位置与字体大小调节
- 新增 **评论区** 功能，播放器界面可自由切换显示歌词/评论区
- 新增 **电台** 功能，可以在我的音乐-收藏-电台中找到，目前仅允许收听已收藏的电台节目
- 新增 **深色模式**功能，可在设置中自行调节浅色/深色模式
- 支持了多系统版本的安装包

  
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
