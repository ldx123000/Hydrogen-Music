const { Menu, globalShortcut } = require('electron')
const Store = require('electron-store');

module.exports = async function registerShortcuts(win) {
    const settingsStore = new Store({name: 'settings'});
    const shortcuts =  await settingsStore.get('settings.shortcuts');
    if(!shortcuts) return
    else if(!(shortcuts.find(shortcut => shortcut.id == 'processForward') || shortcuts.find(shortcut => shortcut.id == 'processBack'))){
        shortcuts.push({
            id: 'processForward',
            name: '快进(3s)',
            shortcut: 'CommandOrControl+]',
            globalShortcut: 'CommandOrControl+Alt+]',
        },
        {
            id: 'processBack',
            name: '后退(3s)',
            shortcut: 'CommandOrControl+[',
            globalShortcut: 'CommandOrControl+Alt+[',
        })
        settingsStore.set('settings.shortcuts', shortcuts);
    }
    const menu = [
        {
            label: 'music',
            submenu: [
                {
                    role: 'playorpause',
                    accelerator: 'Space',
                    click: () => { win.webContents.send('music-playing-control') }
                },
                {
                    role: 'playorpause',
                    accelerator: 'F5',
                    click: () => { win.webContents.send('music-playing-control') }
                },
                {
                    role: 'playorpause',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'play').shortcut,
                    click: () => { win.webContents.send('music-playing-control') }
                },
                {
                    role: 'last',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'last').shortcut,
                    click: () => { win.webContents.send('music-song-control', 'last') }
                },
                {
                    role: 'next',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'next').shortcut,
                    click: () => { win.webContents.send('music-song-control', 'next') }
                },
                {
                    role: 'volumeUp',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'volumeUp').shortcut,
                    click: () => { win.webContents.send('music-volume-up', 'volumeUp') }
                },
                {
                    role: 'volumeDown',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'volumeDown').shortcut,
                    click: () => { win.webContents.send('music-volume-down', 'volumeDown') }
                },
                {
                    role: 'processForward',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'processForward').shortcut,
                    click: () => { win.webContents.send('music-process-control', 'forward') }
                },
                {
                    role: 'processBack',
                    accelerator: shortcuts.find(shortcut => shortcut.id == 'processBack').shortcut,
                    click: () => { win.webContents.send('music-process-control', 'back') }
                },
                {
                    role: 'hidePlayer',
                    accelerator: 'Escape',
                    click: () => { win.webContents.send('hide-player') }
                },
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'close' },
                { role: 'minimize' },
                { role: 'zoom' },
                { role: 'reload' },
                { role: 'forcereload' },
                { role: 'toggledevtools' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ]
        }
    ]
        
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
    
    globalShortcut.register('CommandOrControl+Shift+F12', () => {
        // 获取当前窗口并打开控制台
        win.webContents.openDevTools({mode: 'detach'});
    });
    
    if(!settingsStore.get('settings.other.globalShortcuts')) return
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'play').globalShortcut, () => {
        win.webContents.send('music-playing-control')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'last').globalShortcut, () => {
        win.webContents.send('music-song-control', 'last')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'next').globalShortcut, () => {
        win.webContents.send('music-song-control', 'next')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'volumeUp').globalShortcut, () => {
        win.webContents.send('music-volume-up', 'volumeUp')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'volumeDown').globalShortcut, () => {
        win.webContents.send('music-volume-down', 'volumeDown')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'processForward').globalShortcut, () => {
        win.webContents.send('music-process-control', 'forward')
    })
    globalShortcut.register(shortcuts.find(shortcut => shortcut.id == 'processBack').globalShortcut, () => {
        win.webContents.send('music-process-control', 'back')
    })
}