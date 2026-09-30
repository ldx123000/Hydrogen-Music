(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const localStore = pinia._s.get('localStore')
    return JSON.stringify({
        localFolderSettings: localStore?.localFolderSettings,
        downloadedFolderSettings: localStore?.downloadedFolderSettings,
        localOnlyMode: pinia._s.get('userStore')?.localOnlyMode,
        localStoreKeys: localStore ? Object.keys(localStore.$state || localStore).slice(0, 30) : null,
    })
})()
