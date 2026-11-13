import assert from 'node:assert/strict'
import { after, test } from 'node:test'

// 只替代浏览器音频设备；加载、事件、暂停和重播全部使用项目安装的 Howler。
class AudioDevice extends EventTarget {
    constructor() {
        super()
        this.currentTime = 0
        this.duration = 1
        this.readyState = 4
        this.paused = true
        this.ended = false
        this.muted = false
        this.volume = 1
        this.oncanplaythrough = null
        this.playCount = 0
    }
    canPlayType() { return 'probably' }
    load() { queueMicrotask(() => this.dispatchEvent(new Event('canplaythrough'))) }
    play() {
        this.paused = false
        this.ended = false
        this.playCount += 1
        return Promise.resolve()
    }
    pause() { this.paused = true }
    finish() {
        this.currentTime = this.duration
        this.paused = true
        this.ended = true
        this.dispatchEvent(new Event('ended'))
    }
}

globalThis.Audio = AudioDevice
globalThis.window = { navigator: { userAgent: 'Android WebView test', appVersion: 'Android', platform: 'Linux' }, location: { protocol: 'https:' } }
const { Howl, Howler } = await import('howler')
const { BackgroundHowl } = await import('../src/utils/player/backgroundHowl.mjs')
Howler.autoUnlock = false
Howler.autoSuspend = false

after(() => { Howler.unload(); delete globalThis.Audio; delete globalThis.window })

async function flushEvents() {
    for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

function suspendTimers(t) {
    const pending = []
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
        pending.push(() => callback(...args))
        return pending.length
    })
    return pending
}

async function createPlayer(t, Type, options = {}) {
    const player = new Type({ src: 'test.mp3', html5: true, loop: false, preload: true, ...options })
    t.after(() => player.unload())
    await flushEvents()
    player.play()
    await flushEvents()
    return player
}

test('旧 Howler 在计时器暂停时不执行 ended 回调', async t => {
    let ended = 0
    const player = await createPlayer(t, Howl, { onend: () => { ended += 1 } })
    const pending = suspendTimers(t)
    player._sounds[0]._node.finish()
    await flushEvents()
    assert.equal(ended, 0)
    assert.ok(pending.length > 0)
})

test('单曲在后台连续结束两次都重播，且不重复触发结束处理', async t => {
    let ended = 0
    let stateAtEnd = null
    const player = await createPlayer(t, BackgroundHowl, {
        onend() {
            ended += 1
            stateAtEnd = this.playing()
            this.seek(0)
            this.play()
        },
    })
    suspendTimers(t)
    const node = player._sounds[0]._node
    const initialPlayCount = node.playCount
    for (let cycle = 1; cycle <= 2; cycle += 1) {
        node.finish()
        await flushEvents()
        assert.equal(ended, cycle)
        assert.equal(stateAtEnd, false, '结束回调必须在 Howler 停止旧播放之后执行')
        assert.equal(player.playing(), true)
        assert.equal(node.playCount, initialPlayCount + cycle)
    }
})

test('列表循环可在计时器暂停时加载并播放下一首', async t => {
    let nextPlayer = null
    const first = await createPlayer(t, BackgroundHowl, {
        onend() {
            nextPlayer = new BackgroundHowl({ src: 'next.mp3', html5: true, loop: false })
            nextPlayer.once('load', () => nextPlayer.play())
        },
    })
    t.after(() => nextPlayer?.unload())
    suspendTimers(t)
    first._sounds[0]._node.finish()
    await flushEvents()
    assert.ok(nextPlayer)
    assert.equal(nextPlayer.state(), 'loaded')
    assert.equal(nextPlayer.playing(), true)
    assert.equal(first.playing(), false)
})

test('once、声音 ID、监听器上下文和队列行为与 Howler 一致', async t => {
    const player = await createPlayer(t, BackgroundHowl)
    suspendTimers(t)
    const calls = []
    const id = player._sounds[0]._id
    player.once('seek', function (soundId) { calls.push(['once', soundId, this === player]) }, id)
    player.on('seek', () => calls.push(['wrong-id']), id + 1)
    player.on('seek', function (soundId) { calls.push(['on', soundId, this === player]) }, id)
    let queued = false
    player._queue.push({ event: 'seek', action() {} }, { event: 'play', action() { queued = true } })
    assert.equal(player._emit('seek', id), player)
    assert.deepEqual(calls, [], '回调仍为异步')
    await flushEvents()
    assert.equal(queued, true)
    player._emit('seek', id)
    await flushEvents()
    assert.deepEqual(calls, [['on', id, true], ['once', id, true], ['on', id, true]])
})
