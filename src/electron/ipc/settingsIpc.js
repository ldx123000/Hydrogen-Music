const {
    getDefaultSettings,
    normalizeSettings,
} = require('../../shared/settingsSchema.cjs')
const fs = require('fs')
const path = require('path')

function normalizeDirectoryPath(value) {
    if (typeof value !== 'string') return null
    const trimmedPath = value.trim()
    if (!trimmedPath) return null

    try {
        const stats = fs.statSync(trimmedPath)
        if (stats.isDirectory()) return trimmedPath
        if (stats.isFile()) return path.dirname(trimmedPath)
    } catch (_) {}

    return trimmedPath
}

function normalizeDirectorySettings(settings) {
    const normalizedSettings = normalizeSettings(settings)
    normalizedSettings.local.downloadFolder = normalizeDirectoryPath(normalizedSettings.local.downloadFolder)
    normalizedSettings.local.videoFolder = normalizeDirectoryPath(normalizedSettings.local.videoFolder)
    normalizedSettings.local.localFolder = Array.from(new Set(
        (Array.isArray(normalizedSettings.local.localFolder) ? normalizedSettings.local.localFolder : [])
            .map(normalizeDirectoryPath)
            .filter(Boolean)
    ))
    return normalizedSettings
}

function registerSettingsIpc({ ipcMain, settingsStore, win, registerShortcuts }) {
    ipcMain.on('set-settings', (e, settings) => {
        const parsedSettings = JSON.parse(settings)
        const normalizedSettings = normalizeDirectorySettings(parsedSettings)
        settingsStore.set('settings', normalizedSettings)
        registerShortcuts(win)
    })

    ipcMain.handle('get-settings', async () => {
        const settings = await settingsStore.get('settings')
        if (settings) {
            const normalizedSettings = normalizeDirectorySettings(settings)
            settingsStore.set('settings', normalizedSettings)
            return normalizedSettings
        }

        const initSettings = getDefaultSettings()
        settingsStore.set('settings', initSettings)
        registerShortcuts(win)
        return initSettings
    })
}

module.exports = {
    registerSettingsIpc,
}
