const { execFile } = require('child_process')

const COMMAND_TIMEOUT_MS = 20000
const COMMAND_MAX_BUFFER = 64 * 1024 * 1024
const FONT_CONFIG_COMMANDS = process.platform === 'darwin'
    ? ['fc-list', '/opt/homebrew/bin/fc-list', '/usr/local/bin/fc-list', '/opt/local/bin/fc-list']
    : ['fc-list']
const MAC_SYSTEM_PROFILER_COMMANDS = ['/usr/sbin/system_profiler', 'system_profiler']

function execFileText(command, args = []) {
    return new Promise(resolve => {
        execFile(
            command,
            args,
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: COMMAND_MAX_BUFFER,
                windowsHide: true,
            },
            (error, stdout = '') => resolve(error ? '' : String(stdout || ''))
        )
    })
}

async function execFirstFileText(commands, args = []) {
    const visitedCommands = new Set()

    for (const command of commands) {
        if (!command || visitedCommands.has(command)) continue
        visitedCommands.add(command)

        const output = await execFileText(command, args)
        if (output) return output
    }

    return ''
}

function normalizeFontName(name) {
    return String(name || '')
        .replace(/\\-/g, '-')
        .replace(/\s+\((TrueType|OpenType|Type 1|Collection)\)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function isUsableFontName(name) {
    return !!name && !name.startsWith('.')
}

function getFontOptionScore(option) {
    const text = `${option.label} ${option.value}`.toLocaleLowerCase()
    if (/(regular|常规|標準|标准)/i.test(text)) return 0
    if (/(medium|semibold|中黑|中粗)/i.test(text)) return 1
    if (/(bold|black|heavy|粗|黑|特黑)/i.test(text)) return 2
    if (/(light|thin|细|細|纤细|纖細)/i.test(text)) return 3
    return 4
}

function uniqueFontOptions(options) {
    const byLabel = new Map()

    for (const option of options) {
        const label = normalizeFontName(option?.label)
        const value = normalizeFontName(option?.value)
        if (!isUsableFontName(label) || !isUsableFontName(value)) continue

        const normalizedOption = { label, value }
        const key = label.toLocaleLowerCase()
        const existing = byLabel.get(key)
        if (!existing || getFontOptionScore(normalizedOption) < getFontOptionScore(existing)) {
            byLabel.set(key, normalizedOption)
        }
    }

    return Array.from(byLabel.values())
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
}

function addFontOption(options, label, value) {
    const normalizedLabel = normalizeFontName(label)
    const normalizedValue = normalizeFontName(value)
    if (!isUsableFontName(normalizedLabel) || !isUsableFontName(normalizedValue)) return
    options.push({ label: normalizedLabel, value: normalizedValue })
}

function addFontOptions(options, labels, value) {
    labels.forEach(label => addFontOption(options, label, value))
}

function parseCommaList(value) {
    return String(value || '')
        .split(',')
        .map(normalizeFontName)
        .filter(isUsableFontName)
}

function parseFirstCommaList(value) {
    return parseCommaList(value).slice(0, 1)
}

function parseFontConfigOptions(output) {
    const options = []

    for (const line of String(output || '').split(/\r?\n/)) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        const segments = trimmedLine.split(':')
        const families = parseFirstCommaList(segments.shift() || '')
        const fullnames = []
        const postscriptNames = []

        for (const segment of segments) {
            const fullnameMatch = segment.match(/^fullname=(.*)$/)
            const postscriptMatch = segment.match(/^postscriptname=(.*)$/)
            if (fullnameMatch) fullnames.push(...parseFirstCommaList(fullnameMatch[1]))
            if (postscriptMatch) postscriptNames.push(...parseFirstCommaList(postscriptMatch[1]))
        }

        const value = postscriptNames[0] || fullnames[0] || families[0]
        addFontOptions(options, families, value)
        addFontOptions(options, fullnames, value)
        postscriptNames.forEach(postscriptName => addFontOption(options, postscriptName, postscriptName))
    }

    return uniqueFontOptions(options)
}

function isEnabledFontItem(item) {
    return !item?.enabled || item.enabled === 'yes'
}

async function listFontConfigFonts() {
    const output = await execFirstFileText(FONT_CONFIG_COMMANDS, [':', 'family', 'fullname', 'postscriptname'])
    return parseFontConfigOptions(output)
}

async function listMacFonts() {
    const fontConfigFonts = await listFontConfigFonts()
    const output = await execFirstFileText(MAC_SYSTEM_PROFILER_COMMANDS, ['SPFontsDataType', '-json'])
    if (!output) return fontConfigFonts

    try {
        const data = JSON.parse(output)
        const items = Array.isArray(data?.SPFontsDataType) ? data.SPFontsDataType : []
        const options = []

        for (const item of items) {
            if (!isEnabledFontItem(item)) continue

            const typefaces = Array.isArray(item?.typefaces) ? item.typefaces : []
            for (const typeface of typefaces) {
                if (!isEnabledFontItem(typeface)) continue
                const value = typeface?._name || typeface?.postscriptname || typeface?.postscript_name || typeface?.fullname || typeface?.family
                addFontOptions(options, [typeface?.family, typeface?.fullname, typeface?._name], value)
            }

            if (typefaces.length === 0) addFontOption(options, item?._name, item?._name)
        }

        return uniqueFontOptions([...fontConfigFonts, ...options])
    } catch (_) {
        return fontConfigFonts
    }
}

async function listWindowsFonts() {
    const command = [
        "$paths = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';",
        '$paths | ForEach-Object {',
        '  if (Test-Path $_) {',
        '    (Get-ItemProperty $_).PSObject.Properties |',
        "      Where-Object { $_.Name -notmatch '^PS' } |",
        '      ForEach-Object { $_.Name }',
        '  }',
        '}',
    ].join(' ')

    const output = await execFileText('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command])
    return uniqueFontOptions(output.split(/\r?\n/).map(name => ({ label: name, value: name })))
}

async function listSystemFonts() {
    try {
        if (process.platform === 'darwin') return await listMacFonts()
        if (process.platform === 'win32') return await listWindowsFonts()
        if (process.platform === 'linux') return await listFontConfigFonts()
    } catch (_) {
        return []
    }

    return []
}

module.exports = {
    listSystemFonts,
}
