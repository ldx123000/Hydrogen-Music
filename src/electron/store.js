let electronStorePromise = null

async function getElectronStore() {
    if (!electronStorePromise) {
        electronStorePromise = import('electron-store').then(mod => mod.default || mod)
    }
    return electronStorePromise
}

module.exports = { getElectronStore }