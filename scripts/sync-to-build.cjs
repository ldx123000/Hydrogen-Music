#!/usr/bin/env node
/**
 * 把本工程源码镜像到纯 ASCII 的构建目录。
 *
 * ── 为什么需要这个脚本 ────────────────────────────────────────────
 * AGP 拒绝在含中文的路径下构建，NDK/CMake 编译 libnode 的 JNI 层时也会
 * 因为 GRADLE_USER_HOME 落在中文路径而失败。所以：
 *
 *   工作区（源码主副本，路径可能含中文）
 *        │  ← 本脚本单向镜像（只覆盖，不删除）
 *        ▼
 *   构建目录 C:/hydrogen-build（纯 ASCII，真正跑 gradle 的地方）
 *
 * 之前靠人工 cp，极易忘记，导致"改了源码但打出来的包没变"。
 * run-full-build.sh 会自动调用本脚本，一般不需要手动跑。
 *
 * ── 设计原则 ──────────────────────────────────────────────────────
 * 1. **只覆盖，绝不删除**。宿主对"单轮删除 > 50 个文件"有安全拦截，
 *    删除会直接把同步打断；cpSync 的覆盖语义已经够用。
 * 2. **白名单同步**。只搬运明确的源码路径，不整目录 cp，
 *    避免把 node_modules / dist / build 产物 / local.properties 带过去。
 * 3. **构建目录里独有的产物**（node_modules、android/app/build、
 *    android/app/src/main/assets/public 等）不受影响。
 *
 * 用法：
 *   node scripts/sync-to-build.cjs [目标构建目录]
 *   node scripts/sync-to-build.cjs --dry-run      # 只打印将要同步的内容
 *
 * 环境变量 HM_BUILD_DIR 可覆盖默认目标目录。
 */
const fs = require('fs')
const path = require('path')

const SRC_ROOT = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const positional = argv.filter((item) => !item.startsWith('--'))
const DEST_ROOT = path.resolve(
  positional[0] || process.env.HM_BUILD_DIR || 'C:/hydrogen-build',
)

/** 递归镜像的目录（相对工程根） */
const SYNC_DIRS = [
  'src',
  'scripts',
  'server',
  'docs',
  'android/app/src/main/java',
  'android/app/src/main/res',
]

/** 单独镜像的文件（相对工程根） */
const SYNC_FILES = [
  // 工程根配置
  'package.json',
  'vite.config.js',
  'capacitor.config.json',
  'index.html',
  'background.js',
  'desktop-lyric.html',
  'electron-builder.config.cjs',
  'run-full-build.sh',
  // 文档（让构建目录也是自解释的，不至于只有一堆产物）
  'README.md',
  // 内嵌 Node 运行时（依赖目录 node_modules 不同步，构建目录自己装）
  'mobile-runtime/index.js',
  'mobile-runtime/package.json',
  // Android 原生工程里含手工改动的部分
  // （竖屏锁定、包名 com.hydrogen.music、允许明文 HTTP 等）
  'android/build.gradle',
  'android/settings.gradle',
  'android/variables.gradle',
  'android/gradle.properties',
  'android/capacitor.settings.gradle',
  'android/gradle/wrapper/gradle-wrapper.properties',
  'android/app/build.gradle',
  'android/app/capacitor.build.gradle',
  'android/app/proguard-rules.pro',
  'android/app/src/main/AndroidManifest.xml',
]

/**
 * 兜底防线：即使上面白名单写错，也不碰这些东西。
 * 注意 local.properties 是机器相关配置（sdk.dir），必须留在构建目录本地。
 */
const NEVER_SYNC = [
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  /(^|[\\/])build([\\/]|$)/,
  /(^|[\\/])\.gradle([\\/]|$)/,
  /(^|[\\/])assets[\\/]public([\\/]|$)/,
  /local\.properties$/,
  /\.apk$/,
  /(^|[\\/])\.git([\\/]|$)/,
  // 手机视口自动化测试的浏览器配置目录（几十 MB，属于本机产物）
  /(^|[\\/])cdp-profile([\\/]|$)/,
  // 测试截图（只排 mobile-test 目录下的，src 里的图标是真实资源）
  /(^|[\\/])mobile-test[\\/].*\.png$/i,
]

const shouldSkip = (relPath) =>
  NEVER_SYNC.some((pattern) => pattern.test(relPath.split(path.sep).join('/')))

let copied = 0
let skipped = 0
let identical = 0

function copyFile(relPath) {
  if (shouldSkip(relPath)) {
    skipped += 1
    return
  }
  const from = path.join(SRC_ROOT, relPath)
  const to = path.join(DEST_ROOT, relPath)
  if (!fs.existsSync(from)) {
    console.log(`  · 跳过（源不存在）: ${relPath}`)
    return
  }
  // 内容一致就跳过，避免每次构建都无谓地刷新构建目录里几百个文件的 mtime
  // （mtime 变化会让 gradle/vite 误判为"有改动"而重做工作）。
  if (!DRY_RUN && fs.existsSync(to)) {
    try {
      const a = fs.statSync(from)
      const b = fs.statSync(to)
      if (a.size === b.size
        && fs.readFileSync(from).equals(fs.readFileSync(to))) {
        identical += 1
        return
      }
    } catch (_) { /* 读不了就退回普通复制 */ }
  }
  if (DRY_RUN) {
    console.log(`  → ${relPath}`)
    copied += 1
    return
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  copied += 1
}

function copyDir(relDir) {
  const absDir = path.join(SRC_ROOT, relDir)
  if (!fs.existsSync(absDir)) {
    console.log(`  · 跳过（源目录不存在）: ${relDir}`)
    return
  }

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const full = path.join(currentDir, entry.name)
      const rel = path.relative(SRC_ROOT, full)
      if (shouldSkip(rel)) {
        skipped += 1
        continue
      }
      if (entry.isDirectory()) {
        walk(full)
      } else {
        copyFile(rel)
      }
    }
  }
  walk(absDir)
}

function main() {
  if (path.resolve(SRC_ROOT) === DEST_ROOT) {
    console.log('[sync-to-build] 已经在构建目录里，无需同步')
    return
  }

  console.log(`[sync-to-build] 源码: ${SRC_ROOT}`)
  console.log(`[sync-to-build] 目标: ${DEST_ROOT}${DRY_RUN ? '（dry-run）' : ''}`)

  if (!fs.existsSync(DEST_ROOT)) {
    console.error(`[sync-to-build] ✗ 目标构建目录不存在：${DEST_ROOT}`)
    console.error('  请先按文档把工程复制到纯 ASCII 路径，或设置 HM_BUILD_DIR。')
    process.exit(1)
  }

  for (const dir of SYNC_DIRS) copyDir(dir)
  for (const file of SYNC_FILES) copyFile(file)

  console.log(
    `[sync-to-build] ${DRY_RUN ? '将同步' : '已同步'} ${copied} 个文件`
      + `（内容一致跳过 ${identical} 个，按规则跳过 ${skipped} 个）`,
  )

  if (!DRY_RUN) {
    console.log('[sync-to-build] 构建目录里独有的产物（node_modules / build / assets）未受影响。')
  }
}

main()
