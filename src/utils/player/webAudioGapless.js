const DEFAULT_AUDIO_FETCH_TIMEOUT_MS = 45000

let sharedAudioContext = null

function clampVolume(value) {
    return Math.max(0, Math.min(1, value))
}

function getAudioContext() {
    if (sharedAudioContext) return sharedAudioContext
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) throw new Error('Web Audio API 不可用')
    sharedAudioContext = new AudioContextCtor()
    return sharedAudioContext
}

function toArrayBuffer(payload) {
    if (payload instanceof ArrayBuffer) return payload
    if (ArrayBuffer.isView(payload)) {
        return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
    }
    if (payload && payload.type === 'Buffer' && Array.isArray(payload.data)) {
        return new Uint8Array(payload.data).buffer
    }
    throw new Error('音频二进制数据格式不可用')
}

async function fetchAudioArrayBuffer(url, options = {}) {
    if (options.localPath && windowApi?.readLocalAudioBuffer) {
        return toArrayBuffer(await windowApi.readLocalAudioBuffer(options.localPath))
    }

    if (windowApi?.requestAudioArrayBuffer) {
        return toArrayBuffer(await windowApi.requestAudioArrayBuffer({
            url,
            option: {
                timeout: DEFAULT_AUDIO_FETCH_TIMEOUT_MS,
                headers: {
                    Accept: 'audio/*,*/*',
                },
            },
        }))
    }

    const response = await fetch(url, {
        credentials: 'include',
        cache: 'force-cache',
    })
    if (!response.ok) throw new Error(`音频下载失败: ${response.status}`)
    return response.arrayBuffer()
}

class WebAudioBufferPlayer {
    constructor(buffer) {
        this.__hmWebAudioPlayer = true
        this._context = getAudioContext()
        this._buffer = buffer
        this._gain = this._context.createGain()
        this._gain.connect(this._context.destination)
        this._source = null
        this._sourceToken = 0
        this._state = 'loaded'
        this._playing = false
        this._loop = false
        this._offset = 0
        this._startedAt = 0
        this._scheduledStartAt = 0
        this._events = new Map()
        this._fadeTimer = null
    }

    state() {
        return this._state
    }

    duration() {
        return this._buffer?.duration || 0
    }

    volume(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) return this._gain.gain.value
        const safeValue = clampVolume(value)
        this._gain.gain.setValueAtTime(safeValue, this._context.currentTime)
        return safeValue
    }

    loop(value) {
        if (typeof value === 'boolean') {
            this._loop = value
            if (this._source) this._source.loop = value
        }
        return this._loop
    }

    seek(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return this._getCurrentOffset()
        }

        const nextOffset = this._clampOffset(value)
        this._offset = nextOffset
        if (this._playing) {
            this._stopSource()
            this._startSourceAt(this._context.currentTime, nextOffset)
        }
        return nextOffset
    }

    async play() {
        if (this._state === 'unloaded') return
        if (this._context.state === 'suspended') await this._context.resume()
        if (this._playing) return
        this._startSourceAt(this._context.currentTime, this._offset)
    }

    pause() {
        if (!this._playing) return
        this._offset = this._getCurrentOffset()
        this._stopSource()
        this._playing = false
        this._emit('pause')
    }

    unload() {
        this._state = 'unloaded'
        this._stopSource()
        if (this._fadeTimer) {
            clearTimeout(this._fadeTimer)
            this._fadeTimer = null
        }
        try { this._gain.disconnect() } catch (_) {}
        this._events.clear()
        this._buffer = null
    }

    fade(from, to, durationMs = 0) {
        if (this._state === 'unloaded') return
        const now = this._context.currentTime
        const safeDurationMs = Math.max(0, Number(durationMs) || 0)
        const duration = safeDurationMs / 1000
        this._gain.gain.cancelScheduledValues(now)
        this._gain.gain.setValueAtTime(clampVolume(from), now)
        this._gain.gain.linearRampToValueAtTime(clampVolume(to), now + duration)

        if (this._fadeTimer) clearTimeout(this._fadeTimer)
        this._fadeTimer = setTimeout(() => {
            this._fadeTimer = null
            this._emit('fade')
        }, safeDurationMs)
    }

    on(eventName, handler) {
        if (typeof handler !== 'function') return this
        const handlers = this._events.get(eventName) || new Set()
        handlers.add(handler)
        this._events.set(eventName, handlers)
        return this
    }

    once(eventName, handler) {
        if (typeof handler !== 'function') return this
        const wrappedHandler = (...args) => {
            this.off(eventName, wrappedHandler)
            handler(...args)
        }
        return this.on(eventName, wrappedHandler)
    }

    off(eventName, handler) {
        const handlers = this._events.get(eventName)
        if (!handlers) return this
        handlers.delete(handler)
        if (handlers.size === 0) this._events.delete(eventName)
        return this
    }

    _emit(eventName, ...args) {
        const handlers = this._events.get(eventName)
        if (!handlers) return
        Array.from(handlers).forEach(handler => {
            try { handler(...args) } catch (_) {}
        })
    }

    _clampOffset(value) {
        const duration = this.duration()
        if (duration <= 0) return 0
        return Math.max(0, Math.min(value, Math.max(0, duration - 0.001)))
    }

    _getCurrentOffset() {
        if (!this._playing) return this._offset
        const now = this._context.currentTime
        if (now < this._scheduledStartAt) return this._offset
        const elapsed = now - this._startedAt
        if (this._loop && this.duration() > 0) return elapsed % this.duration()
        return this._clampOffset(elapsed)
    }

    _createSource(token) {
        const source = this._context.createBufferSource()
        source.buffer = this._buffer
        source.loop = this._loop
        source.connect(this._gain)
        source.onended = () => {
            if (token !== this._sourceToken || this._state === 'unloaded') return
            this._source = null
            this._playing = false
            this._offset = 0
            this._emit('end')
        }
        return source
    }

    _startSourceAt(when, offset) {
        if (!this._buffer) return
        this._sourceToken += 1
        const token = this._sourceToken
        const source = this._createSource(token)
        this._source = source
        this._offset = this._clampOffset(offset)
        this._scheduledStartAt = when
        this._startedAt = when - this._offset
        this._playing = true
        source.start(Math.max(when, this._context.currentTime), this._offset)
        this._emit('play')
    }

    _stopSource() {
        const source = this._source
        if (!source) return
        this._sourceToken += 1
        this._source = null
        try {
            source.onended = null
            source.stop(0)
            source.disconnect()
        } catch (_) {}
    }
}

export async function createDecodedAudioPlayer(url, options = {}) {
    const audioContext = getAudioContext()
    const audioData = await fetchAudioArrayBuffer(url, options)
    const decodedBuffer = await audioContext.decodeAudioData(audioData.slice(0))
    return new WebAudioBufferPlayer(decodedBuffer)
}
