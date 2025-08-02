const server = require('NeteaseCloudMusicApi/server')

//启动网易云音乐API
module.exports = async function startNeteaseMusicApi() {
  await server.serveNcmApi({
    checkVersion: true,
    port: 36530,
  });
}