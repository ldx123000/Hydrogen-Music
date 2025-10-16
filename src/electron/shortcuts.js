const { Menu, globalShortcut } = require('electron')
const Store = require('electron-store').default;

// 存储当前应用菜单的引用
let currentApplicationMenu = null;

// 创建应用菜单的函数
async function createApplicationMenu(win, app, songInfo) {
    try {
        const settingsStore = new Store({name: 'settings'});
        const shortcuts = await settingsStore.get('settings.shortcuts');
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
    
    const musicSubmenu = [];
    
    // 如果有歌曲信息，添加到音乐菜单顶部
    if (songInfo && songInfo.name && songInfo.artist) {
        musicSubmenu.push({
            label: `♪ ${songInfo.name} - ${songInfo.artist}`,
            enabled: false // 仅显示信息，不可点击
        });
        musicSubmenu.push({ type: 'separator' });
    }
    
    // 添加音乐控制项
    musicSubmenu.push(
        {
            label: '播放/暂停',
            accelerator: 'Space',
            click: () => { win.webContents.send('music-playing-control') }
        },
        {
            label: '播放/暂停',
            accelerator: 'F5',
            click: () => { win.webContents.send('music-playing-control') }
        },
        {
            label: '播放/暂停',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'play').shortcut,
            click: () => { win.webContents.send('music-playing-control') }
        },
        {
            label: '上一首',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'last').shortcut,
            click: () => { win.webContents.send('music-song-control', 'last') }
        },
        {
            label: '下一首',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'next').shortcut,
            click: () => { win.webContents.send('music-song-control', 'next') }
        },
        {
            label: '音量加',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'volumeUp').shortcut,
            click: () => { win.webContents.send('music-volume-up', 'volumeUp') }
        },
        {
            label: '音量减',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'volumeDown').shortcut,
            click: () => { win.webContents.send('music-volume-down', 'volumeDown') }
        },
        {
            label: '快进 (3s)',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'processForward').shortcut,
            click: () => { win.webContents.send('music-process-control', 'forward') }
        },
        {
            label: '后退 (3s)',
            accelerator: shortcuts.find(shortcut => shortcut.id == 'processBack').shortcut,
            click: () => { win.webContents.send('music-process-control', 'back') }
        },
        {
            label: '隐藏播放器',
            accelerator: 'Escape',
            click: () => { win.webContents.send('hide-player') }
        }
    );

    const menuTemplate = [
        // 在macOS上，第一个菜单项应该是应用名
        ...(process.platform === 'darwin' && app ? [{
            label: app.getName ? app.getName() : 'Hydrogen Music',
            submenu: [
                { role: 'about' },
                // { type: 'separator' },
                // 移除 services 菜单，因为它会添加"语音"等不需要的选项
                // { role: 'services' },
                // { type: 'separator' },
                // { role: 'hide' },
                // { role: 'hideothers' },
                // { role: 'unhide' },
                // { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: '音乐',
            submenu: musicSubmenu
        },
        {
            label: '编辑',
            submenu: [
                { label: '撤销', role: 'undo' },
                { label: '重做', role: 'redo' },
                { type: 'separator' },
                { label: '剪切', role: 'cut' },
                { label: '复制', role: 'copy' },
                { label: '粘贴', role: 'paste' },
                ...(process.platform === 'darwin' ? [
                    { label: '删除', role: 'delete' },
                    { label: '全选', role: 'selectAll' },
                ] : [
                    { label: '删除', role: 'delete' },
                    { type: 'separator' },
                    { label: '全选', role: 'selectAll' }
                ])
            ]
        },
        {
            label: '窗口',
            submenu: [
                { role: 'close', label: '关闭' },
                { role: 'minimize', label: '最小化' },
                { role: 'zoom', label: '缩放' },
                { type: 'separator' },
                { role: 'reload', label: '重新加载' },
                // { role: 'forceReload', label: '强制重新加载' },
                // { role: 'toggleDevTools', label: '切换开发者工具' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '切换全屏' },
                { type: 'separator' },
                { role: 'front', label: '置顶' }
            ]
        }
    ];
        
    currentApplicationMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(currentApplicationMenu);
    } catch (error) {
        console.error('创建应用菜单时出错:', error);
        // 创建一个简单的备用菜单
        const fallbackTemplate = [
            {
                label: '音乐',
                submenu: [
                    {
                        label: '播放/暂停',
                        accelerator: 'Space',
                        click: () => { if (win) win.webContents.send('music-playing-control') }
                    }
                ]
            }
        ];
        currentApplicationMenu = Menu.buildFromTemplate(fallbackTemplate);
        Menu.setApplicationMenu(currentApplicationMenu);
    }
}

module.exports = async function registerShortcuts(win, app) {
    try {
        // 初始创建应用菜单（不显示歌曲信息）
        await createApplicationMenu(win, app);
        
        const settingsStore = new Store({name: 'settings'});
        const shortcuts = await settingsStore.get('settings.shortcuts');
        if(!shortcuts) return;
    
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
    } catch (error) {
        console.error('注册快捷键时出错:', error);
    }
}

// 导出更新应用菜单的函数
module.exports.updateApplicationMenu = createApplicationMenu;
