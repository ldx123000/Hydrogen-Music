const dbus = require('dbus-next');
const {ipcMain, app} = require ('electron');
const Player = require ("mpris-service");

const mprisState = {
  initialized: false,
  window: null,
  player: null,
}

function getRenderer() {
  const activeWindow = mprisState.window
  if (!activeWindow || activeWindow.isDestroyed?.()) return null
  if (!activeWindow.webContents || activeWindow.webContents.isDestroyed?.()) return null
  return activeWindow.webContents
}

function createMpris(window){
  mprisState.window = window;
  if (mprisState.initialized) return;
  mprisState.initialized = true;

  const player = Player({
    name: 'hydrogenmusic',
    identity: 'HydrogenMusic',
  });
  mprisState.player = player;

  player.on('next', () => getRenderer()?.send('next'));
  player.on('previous', () => getRenderer()?.send('previous'));
  player.on('playpause', () => getRenderer()?.send('playpause'));
  player.on('play', () => getRenderer()?.send('play'));
  player.on('pause', () => getRenderer()?.send('pause'));
  player.on('quit', () => app.exit());
  player.on('position', args =>
    getRenderer()?.send('setPosition', args.position / 1000 / 1000)
  );
  player.on('loopStatus', () => getRenderer()?.send('repeat'));
  player.on('shuffle', () => getRenderer()?.send('shuffle'));
  // 当外部通过 MPRIS 改变音量时触发
  player.on('volume', (value) => {
    getRenderer()?.send('volume_changed', value);
  })

  ipcMain.on('music-playing-check', (e, playing) => {
    player.playbackStatus = playing
      ? Player.PLAYBACK_STATUS_PLAYING
      : Player.PLAYBACK_STATUS_PAUSED;
  });

  ipcMain.on('metadata', (e, metadata) => {
    // 更新 Mpris 状态前将位置设为0, 否则 OSDLyrics 获取到的进度是上首音乐切换时的进度
    player.getPosition = () => 0;
    player.metadata = {
      'mpris:trackid': player.objectPath('track/' + metadata.trackId),
      'mpris:artUrl': metadata.artwork[0].src,
      'mpris:length': metadata.length * 1000 * 1000,
      'xesam:title': metadata.title,
      'xesam:album': metadata.album,
      'xesam:artist': metadata.artist,
      'xesam:url': metadata.url,
    };
  });

  ipcMain.on('playerCurrentTrackTime', (e, position) => {
    player.getPosition = () => position * 1000 * 1000;
    player.seeked(position * 1000 * 1000);
  });

  ipcMain.on('seeked', (e, position) => {
    player.seeked(position * 1000 * 1000);
  });

  ipcMain.on('switchRepeatMode', (e, mode) => {
    switch (mode) {
      case 'off':
        player.loopStatus = Player.LOOP_STATUS_NONE;
        break;
      case 'one':
        player.loopStatus = Player.LOOP_STATUS_TRACK;
        break;
      case 'on':
        player.loopStatus = Player.LOOP_STATUS_PLAYLIST;
        break;
    }
  });

  ipcMain.on('switchShuffle', (e, shuffle) => {
    player.shuffle = shuffle;
  });

  ipcMain.on('setVolume', (e, volume) => {
    player.volume = volume;
  });

}

async function createDbus(window) {
  const bus = dbus.sessionBus();
  const Variant = dbus.Variant;

  const osdService = await bus.getProxyObject(
    'org.osdlyrics.Daemon',
    '/org/osdlyrics/Lyrics'
  );

  const osdInterface = osdService.getInterface('org.osdlyrics.Lyrics');

  ipcMain.on('sendLyrics', async (e, {track, lyrics}) => {
    const metadata = {
      title: new Variant('s', track.name),
      artist: new Variant('s', track.ar.map(ar => ar.name).join(', ')),
    };

    await osdInterface.SetLyricContent(metadata, Buffer.from(lyrics));

    window.webContents.send('saveLyricFinished');
  });
}

module.exports = {
  createMpris,
  createDbus
};
