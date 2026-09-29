import test from 'node:test'
import assert from 'node:assert/strict'
import { createTogetherSession, createTogetherState, isTogetherSong, parseTogetherInvitation, togetherShareLink, commandPosition } from '../src/utils/listenTogether.js'

const song = { id: 123, name: 'Song' }
function fixture(overrides = {}) {
    const state = createTogetherState()
    const calls = [], applied = []
    const p = { song, songs: [song, { id: 456 }, { id: 789, type: 'local' }], ready: true, playing: true, progress: 12.345, playMode: 1 }
    let member = false, clock = 1800000000000
    let remote = { playlist: { displayList: { result: ['123', '456'] }, randomList: { result: ['123', '456'] }, playMode: 'ORDER_LOOP', version: [{ userId: 5, version: 7 }] } }
    const session = createTogetherSession({ state, playback: () => p, userId: () => 42, now: () => clock,
        api: async (path, params) => {
            calls.push({ path, params })
            const custom = await overrides.api?.(path, params)
            if (custom) return custom
            if (path === 'status') return { code: 200, data: { inRoom: member, roomInfo: { roomId: 'room-a', creatorId: 42, roomUsers: [{ userId: 42 }] } } }
            if (path === 'room/create' || path === 'accept') { member = true; return { code: 200, data: { roomInfo: { roomId: 'room-a', creatorId: 42 } } } }
            if (path === 'sync/playlist/get') return { code: 200, data: structuredClone(remote) }
            if (path === 'heatbeat') return { code: 200, data: { timeSpan: 30 } }
            return { code: 200, data: { success: true } }
        },
        applyRemote: async (snapshot, active) => {
            await overrides.applyRemote?.(snapshot, active)
            if (!active()) return
            applied.push(snapshot)
            if (snapshot.ids) p.songs = snapshot.ids.map(id => ({ id }))
            if (snapshot.command) {
                p.song = { id: snapshot.command.targetSongId }
                p.playing = snapshot.command.playStatus === 'PLAY'
                p.progress = snapshot.position()
            }
        },
    })
    return { session, state, calls, applied, p,
        setMember: value => { member = value },
        remote: command => { remote.playCommand = { userId: 5, clientSeq: 2, serverSeq: clock, targetSongId: '456', playStatus: 'PLAY', commandType: 'GOTO', progress: 5000, ...command } },
        setQueue: ids => { remote.playlist.displayList.result = ids; remote.playlist.randomList.result = ids },
        advance: ms => { clock += ms },
    }
}

test('official invitations round trip and reject unrelated URLs', () => {
    assert.deepEqual(parseTogetherInvitation(`一起听：${togetherShareLink('room-a', '42', '123')}`), { roomId: 'room-a', inviterId: '42' })
    assert.deepEqual(parseTogetherInvitation('room-a', '42'), { roomId: 'room-a', inviterId: '42' })
    assert.throws(() => parseTogetherInvitation('https://example.org/?roomId=x&inviterId=42'))
    assert.throws(() => parseTogetherInvitation('room-a', '0'))
})
test('only public NCM songs enter the room queue', () => {
    assert.equal(isTogetherSong(song), true)
    for (const item of [{ id: 1, type: 'local' }, { id: 'siren:1' }, { id: 1, source: 'bilibili' }, { id: 1, hmCloudDisk: true }, { id: 1, programId: 10 }, { id: -1 }]) assert.equal(isTogetherSong(item), false)
})
test('server timestamp advances the fixed anchor only while playing', () => {
    const now = 1800000005000
    assert.equal(commandPosition({ progress: 10000, serverSeq: now - 5000, playStatus: 'PLAY' }, now), 15)
    assert.equal(commandPosition({ progress: 10000, serverSeq: now - 5000, playStatus: 'PAUSE' }, now), 10)
    assert.equal(commandPosition({ progress: 10000, serverSeq: 1, playStatus: 'PLAY' }, now, now - 1000), 11)
})
test('create publishes queue before playback and uses official PROGRESS commands', async () => {
    const f = fixture(); await f.session.create()
    assert.deepEqual(f.calls.map(x => x.path), ['status', 'room/create', 'sync/list/command', 'play/command', 'heatbeat'])
    assert.deepEqual(f.calls[2].params.displayList, ['123', '456'])
    assert.equal(f.calls[3].params.progress, 12345)
    f.p.playing = false; await f.session.update()
    assert.equal(f.calls.at(-2).params.commandType, 'PAUSE')
    f.p.progress = 40; await f.session.update({ seek: true })
    assert.equal(f.calls.at(-2).params.commandType, 'PROGRESS')
    assert.equal(f.calls.at(-2).params.progress, 40000)
})
test('joining and restoring apply remote state without publishing a replacement', async () => {
    for (const action of ['join', 'restore']) {
        const f = fixture(); f.remote({ playStatus: 'PAUSE' })
        if (action === 'restore') f.setMember(true)
        await f.session[action]('room-a', '5')
        assert.equal(f.p.song.id, '456'); assert.equal(f.p.playing, false)
        assert.equal(f.calls.some(x => x.path === 'play/command' || x.path === 'sync/list/command'), false)
        assert.equal(f.state.applying, false)
    }
})
test('remote GOTO, PAUSE and PROGRESS follow in both directions without echo', async () => {
    const f = fixture(); await f.session.create(); f.advance(1000); f.remote()
    await f.session.refresh()
    assert.equal(f.p.song.id, '456'); assert.equal(f.p.progress, 5)
    f.advance(1000); f.remote({ commandType: 'PAUSE', playStatus: 'PAUSE', progress: 6000, clientSeq: 3 })
    await f.session.refresh(); assert.equal(f.p.playing, false)
    f.advance(1000); f.remote({ commandType: 'PROGRESS', playStatus: 'PAUSE', progress: 60000, clientSeq: 4 })
    await f.session.refresh(); assert.equal(f.p.progress, 60)
    assert.equal(f.calls.filter(x => x.path === 'play/command').length, 1)
})
test('repeated anchors are not reapplied and different users with same seq are distinct', async () => {
    const f = fixture(); f.setMember(true); f.remote(); await f.session.restore()
    const count = f.applied.length
    f.advance(5000); await f.session.refresh(); assert.equal(f.applied.length, count)
    f.remote({ userId: 6, playStatus: 'PAUSE' }); await f.session.refresh()
    assert.equal(f.p.playing, false); assert.equal(f.applied.length, count + 1)
})
test('own echo and stale server snapshots never rewind local playback', async () => {
    const f = fixture(); await f.session.create()
    const sent = f.calls.find(x => x.path === 'play/command').params
    f.remote({ ...sent, userId: 42 }); f.p.progress = 15
    await f.session.refresh(); assert.equal(f.applied.length, 0); assert.equal(f.p.progress, 15)
    f.advance(1000); f.remote(); await f.session.refresh()
    const count = f.applied.length
    f.remote({ serverSeq: 1799999999000, targetSongId: '123' }); await f.session.refresh()
    assert.equal(f.applied.length, count)
})
test('a delayed old snapshot cannot undo a just-sent local pause', async () => {
    const f = fixture(); f.setMember(true); f.remote({ targetSongId: '123' }); await f.session.restore()
    f.p.playing = false; await f.session.update()
    await f.session.refresh()
    assert.equal(f.p.playing, false)
})
test('remote queue changes and version vectors survive local edits', async () => {
    const f = fixture(); f.setMember(true); await f.session.restore()
    f.setQueue(['123', '456', '999']); await f.session.refresh()
    assert.deepEqual(f.state.queue, ['123', '456', '999'])
    f.p.songs.push({ id: 1000 }); await f.session.update()
    const list = f.calls.filter(x => x.path === 'sync/list/command').at(-1)
    assert.deepEqual(list.params.version, [{ userId: 5, version: 7 }, { userId: 42, version: 1 }])
    assert.ok(list.params.displayList.includes('1000'))
})
test('unsupported sources pause the last shared track once', async () => {
    const f = fixture(); await f.session.create(); f.p.song = { id: 9, type: 'local' }
    await f.session.update(); assert.equal(f.calls.at(-2).params.commandType, 'PAUSE')
    const count = f.calls.length; await f.session.update(); assert.equal(f.calls.length, count)
})
test('loading a local selection is protected from old remote state', async () => {
    const f = fixture(); await f.session.create(); f.p.song = { id: 456 }; f.p.ready = false
    await f.session.update(); await f.session.refresh()
    assert.equal(f.applied.length, 0)
    f.p.ready = true; f.p.progress = 0; await f.session.update()
    assert.equal(f.calls.at(-2).params.commandType, 'GOTO')
    assert.equal(f.calls.at(-2).params.progress, 0)
})
test('reset invalidates in-flight and queued operations', async () => {
    let release, started
    const began = new Promise(resolve => { started = resolve })
    const f = fixture({ api: path => path === 'room/create' ? new Promise(resolve => { release = resolve; started() }) : null })
    const create = f.session.create(); await began
    const refresh = f.session.refresh(); f.session.reset()
    release({ code: 200, data: { roomInfo: { roomId: 'room-a' } } })
    await Promise.all([create, refresh]); assert.equal(f.state.roomId, '')
    assert.deepEqual(f.calls.map(x => x.path), ['status', 'room/create'])
})
test('failed leave retains room and successful retry clears it', async () => {
    let fail = true
    const f = fixture({ api: async path => path === 'end' && fail ? { code: 200, data: { success: false } } : null })
    await f.session.create(); await f.session.leave(); assert.equal(f.state.roomId, 'room-a')
    fail = false; await f.session.leave(); assert.equal(f.state.roomId, '')
})
test('network failures back off and successful polling resets the delay', async () => {
    let fail = false
    const f = fixture({ api: async path => path === 'sync/playlist/get' && fail ? { code: 500, message: '离线' } : null })
    await f.session.create(); fail = true
    await f.session.refresh(); assert.equal(f.state.pollDelay, 4000)
    await f.session.refresh(); assert.equal(f.state.pollDelay, 8000)
    fail = false; await f.session.refresh(); assert.equal(f.state.pollDelay, 2000)
    assert.equal(f.state.connection, 'connected')
})
test('failed outgoing command is retried before reconciling remote playback', async () => {
    let fail = true
    const f = fixture({ api: async path => path === 'play/command' && fail ? { code: 500, message: '离线' } : null })
    await f.session.create(); assert.equal(f.state.error, '离线')
    fail = false; await f.session.refresh()
    assert.equal(f.calls.filter(x => x.path === 'play/command').length, 2)
    assert.equal(f.state.error, '')
})
test('ended membership stops background commands', async () => {
    const f = fixture(); await f.session.create(); f.setMember(false)
    await f.session.refresh({ force: true }); assert.equal(f.state.roomId, '')
    assert.equal(f.calls.at(-1).path, 'status')
})
test('heartbeats obey server timeSpan instead of every poll', async () => {
    const f = fixture(); await f.session.create()
    const count = f.calls.filter(x => x.path === 'heatbeat').length
    f.advance(5000); await f.session.refresh()
    assert.equal(f.calls.filter(x => x.path === 'heatbeat').length, count)
    f.advance(30000); await f.session.refresh()
    assert.equal(f.calls.filter(x => x.path === 'heatbeat').length, count + 1)
})
test('an explicit invite validates recipient and checks server success', async () => {
    const f = fixture({ api: async path => path === 'invite' ? { code: 200, data: { result: true } } : null })
    await f.session.create(); await f.session.invite('42'); assert.match(f.state.error, /自己/)
    await f.session.invite('99'); assert.equal(f.state.invitationSent, true)
    assert.deepEqual(f.calls.at(-1).params, { roomId: 'room-a', acceptorId: '99' })
})
test('network operations remain serialized under concurrent events', async () => {
    let inFlight = 0, peak = 0
    const f = fixture({ api: async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(resolve => setTimeout(resolve, 1)); inFlight-- } })
    await f.session.create(); await Promise.all([f.session.update({ seek: true }), f.session.refresh(), f.session.update()])
    assert.equal(peak, 1)
})

test('multi-room links are not silently accepted as two-person rooms', () => {
    assert.throws(() => parseTogetherInvitation('https://st.music.163.com/listen-together/multishare/?roomId=x&inviterId=42'), /多人/)
})
test('failed remote audio application is retried and never acknowledged early', async () => {
    let fail = true
    const f = fixture({ applyRemote: async () => { if (fail) throw new Error('音频加载失败') } })
    f.setMember(true); f.remote(); await f.session.restore()
    assert.equal(f.state.applying, false); assert.equal(f.applied.length, 0)
    fail = false; await f.session.refresh()
    assert.equal(f.p.song.id, '456'); assert.equal(f.applied.length, 1)
})
test('play mode and random queue are included in local reports', async () => {
    const f = fixture(); await f.session.create()
    f.p.playMode = 3; f.p.shuffledSongs = [{id:456},{id:123}]; await f.session.update()
    const list = f.calls.filter(x => x.path === 'sync/list/command').at(-1)
    assert.equal(list.params.playMode, 'RANDOM')
    assert.deepEqual(list.params.randomList, ['456','123'])
})
