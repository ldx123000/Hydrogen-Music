/**
 * Markdown -> PDF  (完整流水线，无需安装 pandoc)
 *
 *   node md-to-pdf.cjs <input.md> <output.pdf> [标题]
 *
 * 步骤：
 *   1. 把 Markdown 转成自包含的 HTML（标题/表格/代码块/引用/列表/链接）
 *   2. 调 Edge 无头模式打印 PDF
 *
 * 为什么这么做：本机没有 pandoc / wkhtmltopdf / Word，但装有 Edge。
 * 注意：全部走 ASCII 临时路径 —— Edge 命令行参数遇到中文路径会静默失败。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

// ---------------------------------------------------------------- 参数
const [, , inputArg, outputArg, titleArg] = process.argv
if (!inputArg || !outputArg) {
  console.error('usage: node md-to-pdf.cjs <input.md> <output.pdf> [title]')
  process.exit(1)
}
const inputPath = path.resolve(inputArg)
const outputPath = path.resolve(outputArg)
const docTitle = titleArg || path.basename(inputPath, path.extname(inputPath))

// ---------------------------------------------------------------- Markdown -> HTML
const md = fs.readFileSync(inputPath, 'utf8')

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 行内语法：先抽出行内代码，避免其中的符号被后续规则破坏。 */
function inline(text) {
  const codes = []
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code)
    return `\u0000CODE${codes.length - 1}\u0000`
  })
  out = escapeHtml(out)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`)
  return out
}

const lines = md.split(/\r?\n/)
const blocks = []
let i = 0

const isTableSeparator = line => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')
const splitRow = line => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())

while (i < lines.length) {
  const line = lines[i]

  // 围栏代码块
  const fence = line.match(/^\s*```(\w*)\s*$/)
  if (fence) {
    const body = []
    i += 1
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
    i += 1
    blocks.push(`<pre class="code"><code>${escapeHtml(body.join('\n'))}</code></pre>`)
    continue
  }

  // 标题
  const heading = line.match(/^(#{1,6})\s+(.*)$/)
  if (heading) {
    blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
    i += 1
    continue
  }

  // 分隔线
  if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { blocks.push('<hr />'); i += 1; continue }

  // 表格
  if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
    const header = splitRow(line)
    i += 2
    const rows = []
    while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(splitRow(lines[i])); i += 1 }
    const head = header.map(c => `<th>${inline(c)}</th>`).join('')
    const body = rows.map(cells => `<tr>${cells.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
    blocks.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
    continue
  }

  // 引用块
  if (/^\s*>\s?/.test(line)) {
    const body = []
    while (i < lines.length && /^\s*>\s?/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i += 1 }
    blocks.push(`<blockquote>${body.map(inline).join('<br />')}</blockquote>`)
    continue
  }

  // 列表
  if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
    const ordered = /^\s*\d+\.\s+/.test(line)
    const items = []
    while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))
      i += 1
    }
    const tag = ordered ? 'ol' : 'ul'
    blocks.push(`<${tag}>${items.map(it => `<li>${inline(it)}</li>`).join('')}</${tag}>`)
    continue
  }

  // 空行
  if (line.trim() === '') { i += 1; continue }

  // 段落
  const para = [line]
  i += 1
  while (
    i < lines.length && lines[i].trim() !== '' &&
    !/^\s*(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s)/.test(lines[i]) &&
    !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
  ) { para.push(lines[i]); i += 1 }
  blocks.push(`<p>${para.map(inline).join('<br />')}</p>`)
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  :root { --text:#1a1a1a; --line:#dfe3e8; --code:#f6f8fa; --accent:#0b6bcb; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: "Microsoft YaHei","PingFang SC","Source Han Sans SC","Segoe UI",sans-serif;
    font-size: 14px; line-height: 1.75; color: var(--text);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 24px; margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid var(--text); }
  h2 { font-size: 19px; margin: 26px 0 12px; padding-left: 10px; border-left: 4px solid var(--accent); page-break-after: avoid; }
  h3 { font-size: 16px; margin: 20px 0 10px; color: #24303f; page-break-after: avoid; }
  h4 { font-size: 14px; margin: 16px 0 8px; color: #24303f; page-break-after: avoid; }
  p { margin: 9px 0; }
  a { color: var(--accent); text-decoration: none; }
  strong { color: #000; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
  ul, ol { margin: 9px 0; padding-left: 26px; }
  li { margin: 4px 0; }
  blockquote { margin: 13px 0; padding: 10px 16px; border-left: 4px solid var(--accent); background: #f2f7fd; color: #26313d; }
  blockquote p { margin: 0; }
  code {
    font-family: "Cascadia Mono",Consolas,"Courier New",monospace; font-size: 12.5px;
    background: var(--code); border: 1px solid var(--line); border-radius: 3px;
    padding: 1px 5px; color: #b3306b;
  }
  pre.code {
    margin: 13px 0; padding: 13px 16px; background: var(--code);
    border: 1px solid var(--line); border-radius: 6px;
    page-break-inside: avoid; white-space: pre-wrap; word-break: break-word;
  }
  pre.code code { background: none; border: 0; padding: 0; color: #1f2933; font-size: 12.5px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 13px 0; font-size: 13px; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #eef1f5; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  @page { size: A4; margin: 16mm 14mm; }
</style>
</head>
<body>
${blocks.join('\n')}
</body>
</html>`

// ---------------------------------------------------------------- HTML -> PDF (Edge)
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const browser = edgeCandidates.find(p => fs.existsSync(p))
if (!browser) {
  console.error('[md-to-pdf] 未找到 Edge/Chrome，无法生成 PDF')
  process.exit(1)
}

// 全程走 ASCII 临时目录：中文路径会让浏览器命令行静默失败
const tmpDir = path.join(os.tmpdir(), 'md-to-pdf')
fs.mkdirSync(tmpDir, { recursive: true })
const htmlPath = path.join(tmpDir, 'doc.html')
const pdfPath = path.join(tmpDir, 'doc.pdf')
fs.writeFileSync(htmlPath, html, 'utf8')

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/')
try {
  execFileSync(browser, [
    '--headless=old',            // new headless 在部分版本上不触发 print-to-pdf
    '--disable-gpu',
    '--no-sandbox',
    '--print-to-pdf-no-header',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ], { stdio: 'ignore', timeout: 120000 })
} catch (_) {
  // Edge 打印完成后有时返回非零，产物仍可能有效，下面统一校验
}

if (!fs.existsSync(pdfPath)) {
  console.error('[md-to-pdf] PDF 未生成')
  process.exit(1)
}

// 校验确实是 PDF
const head = fs.readFileSync(pdfPath).subarray(0, 5).toString('ascii')
if (head !== '%PDF-') {
  console.error(`[md-to-pdf] 产物不是 PDF（魔数: ${head}）`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.copyFileSync(pdfPath, outputPath)

const size = fs.statSync(outputPath).size
const raw = fs.readFileSync(outputPath).toString('latin1')
const pages = (raw.match(/\/Count\s+(\d+)/) || [, '?'])[1]
console.log(`[md-to-pdf] ${path.basename(inputPath)} -> ${path.basename(outputPath)}  ${pages} 页, ${(size / 1024).toFixed(0)} KB`)
