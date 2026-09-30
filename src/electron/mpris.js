const dbus = require('dbus-next');
const {ipcMain, app} = require ('electron');
const Player = require ("mpris-service");
const { buildMprisMetadata } = require('./mprisMetadata');

const mprisState = {
  initialized: false,
  window: null,
  player: null,
  hasCurrentTrack: false,
  currentTrackPath: '',
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
    desktopEntry: 'hydrogenmusic',
    supportedUriSchemes: ['file', 'http', 'https'],
    supportedMimeTypes: [
      'audio/mpeg',
      'audio/mp4',
      'audio/flac',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
      'audio/aac',
      'audio/webm',
    ],
    supportedInterfaces: ['player'],
  });
  mprisState.player = player;
  player.canControl = true;
  player.canPlay = true;
  player.canPause = true;
  player.canGoNext = true;
  player.canGoPrevious = true;
  player.canSeek = true;
  player.playbackStatus = Player.PLAYBACK_STATUS_STOPPED;
  player.loopStatus = Player.LOOP_STATUS_NONE;
  player.shuffle = false;
  player.volume = 1;

  player.on('next', () => getRenderer()?.send('next'));
  player.on('previous', () => getRenderer()?.send('previous'));
  player.on('playpause', () => getRenderer()?.send('playpause'));
  player.on('play', () => getRenderer()?.send('play'));
  player.on('pause', () => getRenderer()?.send('pause'));
  player.on('stop', () => getRenderer()?.send('pause'));
  player.on('quit', () => {
    const renderer = getRenderer();
    if (renderer) renderer.send('player-save');
    else app.exit();
  });
  player.on('seek', offset => {
    const currentPosition = Number(player.getPosition?.() || 0);
    const nextPosition = Math.max(0, currentPosition + Number(offset || 0));
    getRenderer()?.send('setPosition', nextPosition / 1000 / 1000);
  });
  player.on('position', args =>
    {
      if (args?.trackId && mprisState.currentTrackPath && args.trackId !== mprisState.currentTrackPath) return;
      getRenderer()?.send('setPosition', Math.max(0, Number(args.position || 0)) / 1000 / 1000);
    }
  );
  player.on('loopStatus', loopStatus => getRenderer()?.send('repeat', loopStatus));
  player.on('shuffle', shuffle => getRenderer()?.send('shuffle', Boolean(shuffle)));
  // 当外部通过 MPRIS 改变音量时触发
  player.on('volume', (value) => {
    getRenderer()?.send('volume_changed', value);
  })

  ipcMain.on('music-playing-check', (e, playing) => {
    player.playbackStatus = !mprisState.hasCurrentTrack
      ? Player.PLAYBACK_STATUS_STOPPED
      : playing
      ? Player.PLAYBACK_STATUS_PLAYING
      : Player.PLAYBACK_STATUS_PAUSED;
  });

  ipcMain.on('metadata', (e, metadata) => {
    const nextMetadata = buildMprisMetadata(player, metadata);
    mprisState.hasCurrentTrack = !!nextMetadata;
    if (!nextMetadata) {
      player.metadata = {};
      player.playbackStatus = Player.PLAYBACK_STATUS_STOPPED;
      mprisState.currentTrackPath = '';
      return;
    }
    // 更新 Mpris 状态前将位置设为0, 否则 OSDLyrics 获取到的进度是上首音乐切换时的进度
    player.getPosition = () => 0;
    player.metadata = nextMetadata;
    mprisState.currentTrackPath = nextMetadata['mpris:trackid'];
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
