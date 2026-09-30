#!/usr/bin/env node
/**
 * 给 path-to-regexp 打补丁：替换掉 \p{...} Unicode 属性转义。
 *
 * 为什么需要：
 *   nodejs-mobile 内嵌的 Node 为 small-icu 构建，缺少 Unicode 属性表，
 *   解析 /^[$_\p{ID_Start}]$/u 这类正则时会抛：
 *     Invalid regular expression: ... Invalid property name in character class
 *   而 Express 的路由依赖 path-to-regexp v8，启动时必然加载它，
 *   于是整个网易云 API 起不来。
 *
 * 替换成 ASCII 等价写法即可：路由参数名实际只用 ASCII 标识符。
 *   ID_START    \p{ID_Start}    → A-Za-z（外加 $ 和 _）
 *   ID_CONTINUE \p{ID_Continue} → A-Za-z0-9（外加 $、_、ZWNJ、ZWJ）
 *
 * 用法：node scripts/patch-path-to-regexp.cjs <node_modules 目录> [更多目录...]
 */
const fs = require('fs')
const path = require('path')

const MARKER = '[HM-PATCH-UNICODE-ESCAPE]'

const OLD_START = "const ID_START = /^[$_\\p{ID_Start}]$/u;"
const OLD_CONTINUE = "const ID_CONTINUE = /^[$\\u200c\\u200d\\p{ID_Continue}]$/u;"
const OLD_ID = "const ID = /^[$_\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]*$/u;"

const NEW_ID_START = "const ID_START = /^[$_A-Za-z]$/;"
const NEW_ID_CONTINUE = "const ID_CONTINUE = /^[$\\u200c\\u200dA-Za-z0-9]$/;"
const NEW_ID = "const ID = /^[$_A-Za-z][$\\u200c\\u200dA-Za-z0-9]*$/;"

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('用法: node scripts/patch-path-to-regexp.cjs <node_modules 目录> [...]')
  process.exit(1)
}

let patched = 0
let skipped = 0

for (const base of targets) {
  const file = path.join(base, 'path-to-regexp', 'dist', 'index.js')
  if (!fs.existsSync(file)) {
    continue
  }

  let source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) {
    console.log(`  已打过补丁，跳过: ${file}`)
    skipped += 1
    continue
  }

  const missing = [OLD_START, OLD_CONTINUE, OLD_ID].filter(line => !source.includes(line))
  if (missing.length > 0) {
    console.log(`  未匹配到目标行（可能版本不同），跳过: ${file}`)
    skipped += 1
    continue
  }

  // 把第一行替换成「注释 + 三行新定义」，后两行删掉
  source = source.replace(
    OLD_START,
    `// ${MARKER} nodejs-mobile 的 Node 为 small-icu 构建，不支持 \\p{...} Unicode 属性转义，`
      + `\n// 这里等价替换为 ASCII 字符类（路由参数名实际只用 ASCII 标识符）。`
      + `\n${NEW_ID_START}\n${NEW_ID_CONTINUE}\n${NEW_ID}`
  )
  source = source.replace(OLD_CONTINUE + '\n', '')
  source = source.replace(OLD_ID + '\n', '')

  fs.writeFileSync(file, source)
  console.log(`  已打补丁: ${file}`)
  patched += 1
}

console.log(`[patch-path-to-regexp] 完成：patch ${patched} 个，跳过 ${skipped} 个`)
