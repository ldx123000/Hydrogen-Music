<br />
<p align="center">

  <h2 align="center" style="font-weight: 600">Hydrogen Music 复活版</h2>

  <p align="center">
    首先感谢原作者的绝佳创意和辛勤付出：<a href="https://github.com/Kaidesuyo/Hydrogen-Music" target="blank"><strong>Hydrogen-Music</strong></a>
    <br />
    🎵 我关注到这个项目是在2024年年初，当时还满怀期望地等待作者重构，但是一年多后的现在，原仓库已经删除，原版已经无法登录账号，不登录账号基本上处于无法使用的状态。
    <br />🔄 在这种情况下我决定自己重启这个项目，如果原作者觉得不妥可以与我联系，我将删除该仓库。
    <br />
    ⚠️ 请尽量不要使用云盘中的上传功能，目前上传失败概率大且内存无法得到释放。
    <br />
    <a href="#%EF%B8%8F-安装" target="blank"><strong>📦️ 下载安装包</strong></a>
    <br />
    <br />
  </p>
</p>

## 🌟 主要特性

- 重做了登录功能（目前网易云对第三方客户端管理严格，大多数现存播放器已无法登录，复活版尽力兼容）。  
- 新增 **私人漫游** 功能，可以像原版预期那样探索音乐世界。  
- 支持了多系统版本的安装包
  
## 📦️ 安装

访问 [Releases](https://github.com/ldx123000/Hydrogen-Music/releases)
页面下载安装包。

## 👷‍♂️ 打包客户端

```shell
# 打包
npm run dist
```

```shell
# mac版打包
npm run dist-mac
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
![privateFM][privateFM-screenshot:]
![music_video][music_video-screenshot]

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[home-screenshot]: img/home.png
[lyric-screenshot]: img/lyric.png
[privateFM-screenshot:]: img/privateFM.png
[music_video-screenshot]: img/music_video.png
