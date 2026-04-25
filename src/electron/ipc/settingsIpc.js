const {
    getDefaultSettings,
    normalizeSettings,
} = require('../../shared/settingsSchema.cjs')

function registerSettingsIpc({ ipcMain, settingsStore, win, registerShortcuts }) {
    ipcMain.on('set-settings', (e, settings) => {
        const parsedSettings = JSON.parse(settings)
        const normalizedSettings = normalizeSettings(parsedSettings)
        settingsStore.set('settings', normalizedSettings)
        registerShortcuts(win)
    })

    ipcMain.handle('get-settings', async () => {
        const settings = await settingsStore.get('settings')
        if (settings) {
            const normalizedSettings = normalizeSettings(settings)
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
