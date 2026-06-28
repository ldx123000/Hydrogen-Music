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

function uniqueFontOptions(options) {
    const byValue = new Map()

    for (const option of options) {
        const label = normalizeFontName(option?.label)
        const value = normalizeFontName(option?.value)
        if (!isUsableFontName(label) || !isUsableFontName(value)) continue

        const key = value.toLocaleLowerCase()
        if (!byValue.has(key)) byValue.set(key, { label, value })
    }

    return Array.from(byValue.values()).sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    )
}

function addFontOption(options, label, value) {
    const normalizedLabel = normalizeFontName(label)
    const normalizedValue = normalizeFontName(value)
    if (!isUsableFontName(normalizedLabel) || !isUsableFontName(normalizedValue)) return
    options.push({ label: normalizedLabel, value: normalizedValue })
}

function parseCommaList(value) {
    return String(value || '')
        .split(',')
        .map(normalizeFontName)
        .filter(isUsableFontName)
}

function parseFontConfigOptions(output) {
    const options = []

    for (const line of String(output || '').split(/\r?\n/)) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        const segments = trimmedLine.split(':')
        const families = parseCommaList(segments.shift() || '')
        const fullnames = []
        const postscriptNames = []

        for (const segment of segments) {
            const fullnameMatch = segment.match(/^fullname=(.*)$/)
            const postscriptMatch = segment.match(/^postscriptname=(.*)$/)
            if (fullnameMatch) fullnames.push(...parseCommaList(fullnameMatch[1]))
            if (postscriptMatch) postscriptNames.push(...parseCommaList(postscriptMatch[1]))
        }

        const value = postscriptNames[0] || fullnames[0] || families[0]
        families.forEach(family => addFontOption(options, family, value))
        fullnames.forEach(fullname => addFontOption(options, fullname, value))
        postscriptNames.forEach(postscriptName => addFontOption(options, postscriptName, postscriptName))
    }

    return uniqueFontOptions(options)
}

async function listFontConfigFonts() {
    const output = await execFirstFileText(FONT_CONFIG_COMMANDS, [':', 'family', 'fullname', 'postscriptname'])
    return parseFontConfigOptions(output)
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

async function listMacFonts() {
    const fontConfigFonts = await listFontConfigFonts()
    const output = await execFirstFileText(MAC_SYSTEM_PROFILER_COMMANDS, ['SPFontsDataType', '-json'])
    if (!output) return fontConfigFonts

    try {
        const data = JSON.parse(output)
        const items = Array.isArray(data?.SPFontsDataType) ? data.SPFontsDataType : []
        const options = [...fontConfigFonts]

        for (const item of items) {
            const typefaces = Array.isArray(item?.typefaces) ? item.typefaces : []
            for (const typeface of typefaces) {
                const value = typeface?._name || typeface?.postscriptname || typeface?.fullname || typeface?.family
                addFontOption(options, typeface?.family, value)
                addFontOption(options, typeface?.fullname, value)
                addFontOption(options, typeface?._name, value)
            }

            if (typefaces.length === 0) addFontOption(options, item?._name, item?._name)
        }

        return uniqueFontOptions(options)
    } catch (_) {
        return fontConfigFonts
    }
}

async function listSystemFonts() {
    try {
        if (process.platform === 'win32') return await listWindowsFonts()
        if (process.platform === 'darwin') return await listMacFonts()
        if (process.platform === 'linux') return await listFontConfigFonts()
    } catch (_) {
        return []
    }

    return []
}

module.exports = {
    listSystemFonts,
}
