#!/usr/bin/env node
/**
 * 仅启动内置网易云 API（开发时配合 npm run dev:mobile 使用）
 *
 * 生产环境请用 server/mobile-server.cjs，它会同时托管前端构建产物。
 */
const startNeteaseMusicApi = require('../src/electron/services.js')

startNeteaseMusicApi()
  .then(state => {
    if (state && state.ready) {
      console.log('[api] 网易云 API 已就绪: http://127.0.0.1:36530')
      return
    }
    console.error('[api] 启动失败:', state && state.error)
    process.exitCode = 1
  })
  .catch(error => {
    console.error('[api] 启动异常:', error)
    process.exitCode = 1
  })
