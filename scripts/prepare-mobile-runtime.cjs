#!/usr/bin/env node
/**
 * ⚠️ 已废弃（DEPRECATED）——当前没有任何地方调用本脚本。
 *
 * 这是早期方案：把内嵌 Node 运行时放进 dist/nodejs，再由 Capacitor 的 Node.js 插件加载。
 * 问题在于 vite build 会清空重建 dist，而运行时是 5000+ 个文件，
 * 每次清理都会撞上构建环境的批量删除保护，把整个构建卡死。
 *
 * 现方案由 scripts/build-android.cjs 的 copyRuntime() 取代：
 * 运行时直接放进 android/app/src/main/assets/public/nodejs，
 * 绕过 dist，且 cap sync 之后才放入。
 *
 * 保留本文件仅为留档。确认无人使用后可删除（注意：项目没有 git，删除不可恢复）。
 *
 * ---------------------------------------------------------------------------
 * 把内嵌 Node 运行时打进 dist/nodejs，供 Capacitor 的 Node.js 插件加载。
 *
 * 两件事：
 *   1. 复制 mobile-runtime/（入口 + 精简依赖）到 dist/nodejs/
 *      —— 必须在 vite build 之后执行，因为 dist 会被清空重建
 *   2. 覆盖上桌面端已验证过的那几个依赖补丁文件
 *      —— mobile-runtime 是独立 npm install 的，拿不到项目根的 postinstall 补丁
 *
 * 为什么不能像前端那样打包成单文件：
 * api 包在运行时用 getModulesDefinitions 扫描 module/ 目录动态 require，
 * 打包器无法静态分析出这些依赖，所以必须保留真实的目录结构。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'mobile-runtime')
const DEST_DIR = path.join(ROOT, 'dist', 'nodejs')
const API_PKG = path.join('@neteasecloudmusicapienhanced', 'api')

// 桌面端的 scripts/patch-ncm-api.cjs 改的就是这几个文件
const PATCHED_FILES = [
  'util/index.js',
  'util/request.js',
  'server.js',
  'module/song_url_v1.js',
]

function log(message) {
  console.log(`[prepare-runtime] ${message}`)
}

function fail(message) {
  console.error(`[prepare-runtime] ✗ ${message}`)
  process.exit(1)
}

function main() {
  if (!fs.existsSync(path.join(SRC_DIR, 'node_modules', API_PKG))) {
    fail(`找不到运行时依赖，请先在 mobile-runtime/ 下执行 npm install`)
  }
  if (!fs.existsSync(path.join(ROOT, 'dist'))) {
    fail('dist 不存在，请先执行 vite build')
  }

  log('复制运行时到 dist/nodejs ...')
  fs.rmSync(DEST_DIR, { recursive: true, force: true })
  fs.cpSync(SRC_DIR, DEST_DIR, {
    recursive: true,
    dereference: true,
    filter: source => !source.endsWith('package-lock.json'),
  })

  log('应用依赖补丁 ...')
  let applied = 0
  PATCHED_FILES.forEach(relativePath => {
    const from = path.join(ROOT, 'node_modules', API_PKG, relativePath)
    const to = path.join(DEST_DIR, 'node_modules', API_PKG, relativePath)
    if (!fs.existsSync(from)) {
      log(`  跳过 ${relativePath}（源文件不存在）`)
      return
    }
    if (!fs.existsSync(to)) {
      log(`  跳过 ${relativePath}（目标文件不存在）`)
      return
    }
    fs.copyFileSync(from, to)
    applied += 1
  })
  log(`  已应用 ${applied}/${PATCHED_FILES.length} 个补丁文件`)

  // 体积统计，方便判断 APK 会不会过大
  let fileCount = 0
  let totalBytes = 0
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        fileCount += 1
        try { totalBytes += fs.statSync(full).size } catch (_) { }
      }
    }
  }
  walk(DEST_DIR)

  log(`完成：${fileCount} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
}

main()
