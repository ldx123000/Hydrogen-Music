function clampVolume(value) {
    const volume = Number(value)
    if (!Number.isFinite(volume)) return 0
    return Math.max(0, Math.min(1, volume))
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
}

function isHttpUrl(value) {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch (_) {
        return false
    }
}

let sharedAnalyserAudioContext = null

function getAnalyserAudioContext() {
    if (sharedAnalyserAudioContext) return sharedAnalyserAudioContext
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) throw new Error('Web Audio API 不可用')
    sharedAnalyserAudioContext = new AudioContextCtor()
    return sharedAnalyserAudioContext
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

function hasHifiOutputApi() {
    return typeof windowApi !== 'undefined'
        && typeof windowApi.startHifiOutput === 'function'
        && typeof windowApi.onHifiOutputEvent === 'function'
}

function ignoreAsyncError(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch(() => {})
}

class HifiOutputPlayer {
    constructor(source, options = {}) {
        this.__hmHifiOutputPlayer = true
        this._source = source
        this._localPath = options.localPath || (isHttpUrl(source) ? '' : source)
        this._options = options
        this._sessionId = null
        this._state = 'loading'
        this._loaded = false
        this._playing = false
        this._loop = false
        this._duration = Math.max(0, normalizeNumber(options.duration, 0))
        this._position = 0
        this._positionUpdatedAt = Date.now()
        this._volume = clampVolume(options.volume)
        this._events = new Map()
        this._disposeEventListener = null
        this._fadeTimer = null
        this._seekTimer = null
        this._seekInFlight = false
        this._pendingSeekPosition = null
        this._lastSentSeekPosition = null
        this._suppressBackendPositionUntil = 0
        this._analyserContext = null
        this._analyserBuffer = null
        this._analyserVolumeGain = null
        this._analyserSilentGain = null
        this._analyser = null
        this._analyserSource = null
        this._analyserSourceToken = 0
        this._analyserPreparing = null
        this._analyserFailed = false
    }

    async load() {
        if (!hasHifiOutputApi()) throw new Error('HiFi 输出后端不可用')
        if (!this._localPath) throw new Error('HiFi 输出仅支持本地音乐文件')

        const result = await windowApi.startHifiOutput({
            filePath: this._localPath,
            url: '',
            mpvPath: this._options.mpvPath || '',
            mode: this._options.mode || 'shared',
            audioDevice: this._options.audioDevice || 'auto',
            volume: this._volume,
        })

        if (!result?.ok) {
            const error = new Error(result?.message || 'HiFi 输出启动失败')
            error.result = result
            throw error
        }

        this._sessionId = result.sessionId
        this._disposeEventListener = windowApi.onHifiOutputEvent(payload => this._handleBackendEvent(payload))
        this._applyState(result.state, { syncPlaying: true })

        if (result.state?.loaded) {
            this._loaded = true
            this._state = 'loaded'
        }

        return this
    }

    state() {
        return this._state
    }

    duration() {
        return this._duration
    }

    volume(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) return this._volume
        this._volume = clampVolume(value)
        this._setAnalyserVolume(this._volume)
        if (this._state !== 'unloaded' && this._sessionId) {
            ignoreAsyncError(windowApi.setHifiOutputVolume?.(this._sessionId, this._volume))
        }
        return this._volume
    }

    loop(value) {
        if (typeof value === 'boolean') {
            this._loop = value
            if (this._analyserSource) this._analyserSource.loop = value
            if (this._state !== 'unloaded' && this._sessionId) {
                ignoreAsyncError(windowApi.setHifiOutputLoop?.(this._sessionId, value))
            }
        }
        return this._loop
    }

    seek(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return this._getEstimatedPosition()
        }

        const position = this._clampPosition(value)
        this._setPosition(position)
        this._syncAnalyserPlayback({ restart: true })
        this._suppressBackendPositionUntil = Date.now() + 600
        if (this._state !== 'unloaded' && this._sessionId) {
            this._scheduleSeek(position)
        }
        return position
    }

    play() {
        if (this._state === 'unloaded' || !this._sessionId) return
        ignoreAsyncError(windowApi.setHifiOutputPaused?.(this._sessionId, false))
        this._setPlaying(true)
    }

    pause() {
        if (this._state === 'unloaded' || !this._sessionId) return
        this._setPosition(this._getEstimatedPosition())
        ignoreAsyncError(windowApi.setHifiOutputPaused?.(this._sessionId, true))
        this._setPlaying(false)
    }

    unload() {
        if (this._state === 'unloaded') return
        this._state = 'unloaded'
        this._playing = false
        if (this._fadeTimer) {
            clearTimeout(this._fadeTimer)
            this._fadeTimer = null
        }
        if (this._seekTimer) {
            clearTimeout(this._seekTimer)
            this._seekTimer = null
        }
        this._pendingSeekPosition = null
        this._disposeEventListener?.()
        this._disposeEventListener = null
        if (this._sessionId) {
            ignoreAsyncError(windowApi.stopHifiOutput?.(this._sessionId))
        }
        this._resetAnalyser()
        this._events.clear()
    }

    prepareAnalyser() {
        if (this._state === 'unloaded') return null
        if (this._analyser) return Promise.resolve(this._analyser)
        if (this._analyserFailed) return null
        if (this._analyserPreparing) return this._analyserPreparing

        this._analyserPreparing = this._prepareAnalyser()
            .catch(error => {
                this._analyserFailed = true
                throw error
            })
            .finally(() => {
                this._analyserPreparing = null
            })

        return this._analyserPreparing
    }

    getAnalyser() {
        return this._analyser || null
    }

    fade(from, to, durationMs = 0) {
        if (this._state === 'unloaded') return
        if (this._fadeTimer) {
            clearTimeout(this._fadeTimer)
            this._fadeTimer = null
        }

        const endVolume = clampVolume(to)
        this.volume(endVolume)
        this._emit('fade')
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

    _handleBackendEvent(payload) {
        if (!payload || payload.sessionId !== this._sessionId) return

        if (payload.type === 'load') {
            this._applyState(payload.state, { syncPlaying: true })
            this._loaded = true
            this._state = 'loaded'
            this._emit('load')
        } else if (payload.type === 'play') {
            this._applyState(payload.state)
            this._setPlaying(true)
        } else if (payload.type === 'pause') {
            this._applyState(payload.state)
            this._setPlaying(false)
        } else if (payload.type === 'end') {
            this._applyState(payload.state)
            this._setPosition(this._duration || this._position)
            this._setPlaying(false)
            this._emit('end')
        } else if (payload.type === 'error') {
            this._applyState(payload.state)
            this._emit('loaderror', null, payload.message || 'hifi-output-error')
        } else if (payload.type === 'exit' && this._state !== 'unloaded') {
            this._applyState(payload.state)
            this._state = 'unloaded'
            this._setPlaying(false)
        } else {
            this._applyState(payload.state)
        }
    }

    _applyState(state, options = {}) {
        if (!state || typeof state !== 'object') return
        if (state.loaded) {
            this._loaded = true
            if (this._state !== 'unloaded') this._state = 'loaded'
        }
        if (Number.isFinite(Number(state.duration)) && Number(state.duration) > 0) {
            const nextDuration = Number(state.duration)
            if (Math.abs(nextDuration - this._duration) > 0.001) {
                this._duration = nextDuration
                this._emit('duration', nextDuration)
            }
        }
        if (Number.isFinite(Number(state.position)) && Number(state.position) >= 0) {
            const position = Number(state.position)
            if (this._shouldApplyBackendPosition(position)) this._setPosition(position)
        }
        if (Number.isFinite(Number(state.volume))) {
            this._volume = clampVolume(Number(state.volume) / 100)
            this._setAnalyserVolume(this._volume)
        }
        if (options.syncPlaying === true && typeof state.paused === 'boolean') {
            this._playing = !state.paused
            this._syncAnalyserPlayback()
        }
    }

    _setPlaying(playing) {
        const nextPlaying = playing === true
        if (this._playing === nextPlaying) {
            this._syncAnalyserPlayback()
            return
        }
        if (!nextPlaying) this._setPosition(this._getEstimatedPosition())
        this._playing = nextPlaying
        this._positionUpdatedAt = Date.now()
        this._syncAnalyserPlayback()
        this._emit(nextPlaying ? 'play' : 'pause')
    }

    _setPosition(value) {
        this._position = this._clampPosition(normalizeNumber(value, 0))
        this._positionUpdatedAt = Date.now()
    }

    _shouldApplyBackendPosition(position) {
        if (Date.now() >= this._suppressBackendPositionUntil) return true
        return Math.abs(position - this._position) <= 0.75
    }

    _scheduleSeek(position) {
        this._pendingSeekPosition = this._clampPosition(position)
        if (this._seekTimer) clearTimeout(this._seekTimer)
        this._seekTimer = setTimeout(() => {
            this._seekTimer = null
            this._flushPendingSeek()
        }, 80)
    }

    async _flushPendingSeek() {
        if (this._seekInFlight || this._state === 'unloaded' || !this._sessionId) return

        const position = this._pendingSeekPosition
        this._pendingSeekPosition = null
        if (!Number.isFinite(Number(position))) return
        if (this._lastSentSeekPosition !== null && Math.abs(position - this._lastSentSeekPosition) < 0.05) return

        this._seekInFlight = true
        this._lastSentSeekPosition = position
        this._suppressBackendPositionUntil = Date.now() + 600
        try {
            await windowApi.seekHifiOutput?.(this._sessionId, position)
        } catch (_) {
            // Ignore seek races during unload or rapid track switching.
        } finally {
            this._seekInFlight = false
            if (this._pendingSeekPosition !== null && this._state !== 'unloaded') {
                this._seekTimer = setTimeout(() => {
                    this._seekTimer = null
                    this._flushPendingSeek()
                }, 0)
            }
        }
    }

    _clampPosition(value) {
        const position = Math.max(0, normalizeNumber(value, 0))
        return this._duration > 0 ? Math.min(position, this._duration) : position
    }

    _getEstimatedPosition() {
        if (!this._playing) return this._position
        const elapsed = Math.max(0, Date.now() - this._positionUpdatedAt) / 1000
        return this._clampPosition(this._position + elapsed)
    }

    async _prepareAnalyser() {
        if (typeof windowApi === 'undefined') {
            throw new Error('音频分析接口不可用')
        }

        const context = getAnalyserAudioContext()
        this._analyserContext = context
        if (context.state === 'suspended') await context.resume().catch(() => {})

        const audioData = toArrayBuffer(await this._readAnalyserAudioBuffer())
        const decodedBuffer = await context.decodeAudioData(audioData.slice(0))
        if (this._state === 'unloaded') return null

        const volumeGain = context.createGain()
        const nextAnalyser = context.createAnalyser()
        const silentGain = context.createGain()
        volumeGain.gain.setValueAtTime(this._volume, context.currentTime)
        silentGain.gain.setValueAtTime(0, context.currentTime)
        volumeGain.connect(nextAnalyser)
        nextAnalyser.connect(silentGain)
        silentGain.connect(context.destination)

        this._analyserBuffer = decodedBuffer
        this._analyserVolumeGain = volumeGain
        this._analyserSilentGain = silentGain
        this._analyser = nextAnalyser
        if (!this._duration && Number.isFinite(decodedBuffer.duration)) {
            this._duration = decodedBuffer.duration
        }
        this._syncAnalyserPlayback()
        return nextAnalyser
    }

    _setAnalyserVolume(value) {
        const gain = this._analyserVolumeGain?.gain
        const context = this._analyserContext
        if (!gain || !context) return
        try {
            gain.cancelScheduledValues(context.currentTime)
            gain.setValueAtTime(clampVolume(value), context.currentTime)
        } catch (_) {}
    }

    _readAnalyserAudioBuffer() {
        if (this._localPath && typeof windowApi.readLocalAudioBuffer === 'function') {
            return windowApi.readLocalAudioBuffer(this._localPath)
        }

        throw new Error('音频分析数据源不可用')
    }

    _syncAnalyserPlayback(options = {}) {
        if (this._state === 'unloaded') {
            this._stopAnalyserSource()
            return
        }
        if (!this._analyserBuffer || !this._analyser) return
        if (!this._playing) {
            this._stopAnalyserSource()
            return
        }
        if (options.restart === true || !this._analyserSource) {
            this._startAnalyserSource(this._getEstimatedPosition())
        }
    }

    _startAnalyserSource(position = 0) {
        const context = this._analyserContext
        const buffer = this._analyserBuffer
        const output = this._analyserVolumeGain
        if (!context || !buffer || !output || this._state === 'unloaded') return

        this._stopAnalyserSource()
        if (context.state === 'suspended') {
            ignoreAsyncError(context.resume())
        }

        this._analyserSourceToken += 1
        const token = this._analyserSourceToken
        const source = context.createBufferSource()
        const offset = this._clampAnalyserOffset(position)
        source.buffer = buffer
        source.loop = this._loop
        source.connect(output)
        source.onended = () => {
            if (token !== this._analyserSourceToken) return
            this._analyserSource = null
        }
        this._analyserSource = source

        try {
            source.start(context.currentTime, offset)
        } catch (_) {
            this._stopAnalyserSource()
        }
    }

    _stopAnalyserSource() {
        const source = this._analyserSource
        if (!source) return
        this._analyserSourceToken += 1
        this._analyserSource = null
        try {
            source.onended = null
            source.stop(0)
            source.disconnect()
        } catch (_) {}
    }

    _resetAnalyser() {
        this._stopAnalyserSource()
        try { this._analyserVolumeGain?.disconnect() } catch (_) {}
        try { this._analyser?.disconnect() } catch (_) {}
        try { this._analyserSilentGain?.disconnect() } catch (_) {}
        this._analyserBuffer = null
        this._analyserVolumeGain = null
        this._analyserSilentGain = null
        this._analyser = null
        this._analyserContext = null
    }

    _clampAnalyserOffset(value) {
        const offset = Math.max(0, normalizeNumber(value, 0))
        const duration = Number(this._analyserBuffer?.duration)
        if (!Number.isFinite(duration) || duration <= 0) return offset
        return Math.min(offset, Math.max(0, duration - 0.001))
    }
}

export async function createHifiOutputPlayer(filePath, options = {}) {
    const player = new HifiOutputPlayer(filePath, options)
    return player.load()
}
