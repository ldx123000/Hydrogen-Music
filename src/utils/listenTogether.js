export function isTogetherSong(song) {
    return !!song && /^\d+$/.test(String(song.id)) && Number(song.id) > 0
        && !['local', 'dj', 'bilibili'].includes(song.type)
        && (!song.source || song.source === 'netease')
        && !song.programId && !song.programID && !song.programid && !song.hmCloudDisk
}

export function parseTogetherInvitation(text, inviterId = '') {
    const input = String(text || '').trim()
    const match = input.match(/https?:\/\/[^\s<>"']+/)
    if (match) {
        const url = new URL(match[0])
        if (url.hostname === 'st.music.163.com' && url.pathname.includes('/multishare')) throw new Error('这是多人一起听链接；当前接入的是双人房间，请使用“耳机分你一半”的邀请链接')
        if (url.hostname !== 'st.music.163.com' || !/^\/listen-together\/share\/?$/.test(url.pathname)) {
            throw new Error('请粘贴网易云一起听的完整邀请链接，或手动填写房间 ID 和邀请者 ID')
        }
        return validateInvitation(url.searchParams.get('roomId'), url.searchParams.get('inviterId'))
    }
    return validateInvitation(input, inviterId)
}

function validateInvitation(roomId, inviterId) {
    if (!roomId || !/^[\w-]+$/.test(roomId) || !/^\d+$/.test(String(inviterId || '')) || Number(inviterId) <= 0) {
        throw new Error('请填写有效的房间 ID 和邀请者 ID')
    }
    return { roomId: String(roomId), inviterId: String(inviterId) }
}

export function togetherShareLink(roomId, inviterId, songId) {
    if (!roomId || !inviterId) return ''
    const params = new URLSearchParams({ roomId, inviterId })
    if (/^\d+$/.test(String(songId || ''))) params.set('songId', songId)
    return `https://st.music.163.com/listen-together/share/?${params}`
}

export const togetherPlayMode = value => ['ORDER_LOOP', 'ORDER_LOOP', 'SINGLE_LOOP', 'RANDOM'][value] || 'ORDER_LOOP'
export const localPlayMode = value => ({ ORDER_LOOP: 1, SINGLE_LOOP: 2, RANDOM: 3 })[value] ?? 1
export const togetherIds = value => Array.isArray(value)
    ? [...new Set(value.map(item => String(item?.songId ?? item?.id ?? item)).filter(id => /^\d+$/.test(id) && Number(id) > 0))] : []

export function commandIdentity(command) {
    return command ? [command.serverSeq, command.userId, command.clientSeq, command.commandType, command.targetSongId, command.playStatus, command.progress].join(':') : ''
}

export function commandPosition(command, now = Date.now(), receivedAt = now) {
    const progress = Math.max(0, Number(command.progress) || 0)
    const timestamp = Number(command.serverSeq)
    const anchor = timestamp > 1e12 && Math.abs(now - timestamp) < 600000 ? timestamp : receivedAt
    return (progress + (command.playStatus === 'PLAY' ? Math.max(0, now - anchor) : 0)) / 1000
}

export function createTogetherState() {
    return { roomId: '', creatorId: '', inviterId: '', users: [], busy: false, applying: false,
        error: '', lastSynced: 0, connectedAt: 0, pollDelay: 2000, queue: [], history: [],
        connection: 'idle', invitationSent: false, mode: 'ORDER_LOOP' }
}

export function createTogetherSession({ state, api, playback, userId, applyRemote = async () => {}, now = Date.now }) {
    let generation = 0
    let sequence = 0
    let pending = Promise.resolve()
    let last = null
    let queueKey = ''
    let versions = []
    let seenCommand = ''
    let newestServerSeq = 0
    let awaitingEcho = null
    let lastStatusAt = 0
    let heartbeatAt = 0
    let heartbeatMs = 20000
    let failures = 0
    let localRevision = 0
    let dirty = false
    let dirtyAt = 0
    let seekRequested = false
    const active = token => token === generation
    const message = error => error?.response?.data?.message || error?.message || '一起听连接失败，正在重试'
    const enqueue = task => {
        const token = generation
        const result = pending.catch(() => {}).then(() => active(token) ? task(token) : undefined)
        pending = result
        return result
    }
    const call = async (path, params = {}) => {
        const result = await api(path, params)
        if (Number(result?.code) !== 200 || result?.data?.success === false) {
            const error = new Error(result?.message || result?.msg || result?.data?.failedMessage || '一起听请求失败，请重试')
            error.code = Number(result?.code)
            throw error
        }
        return result.data || {}
    }
    const reset = () => {
        generation++
        last = null
        queueKey = ''
        versions = []
        seenCommand = ''
        newestServerSeq = 0
        awaitingEcho = null
        lastStatusAt = 0
        heartbeatAt = 0
        failures = 0
        dirty = false
        seekRequested = false
        Object.assign(state, createTogetherState())
    }
    const fail = (error, token, background = false) => {
        if (!active(token)) return
        if ([301, 488].includes(Number(error.code || error?.response?.data?.code))) {
            reset()
            state.error = '房间或登录状态已失效，请重新连接'
            return
        }
        state.error = message(error)
        if (background) {
            state.connection = 'reconnecting'
            state.pollDelay = Math.min(30000, 2000 * 2 ** Math.min(++failures, 4))
        }
    }
    const success = () => {
        failures = 0
        state.pollDelay = 2000
        state.connection = 'connected'
        state.error = ''
        state.lastSynced = now()
    }
    const action = task => {
        if (state.busy) return Promise.resolve()
        state.busy = true
        state.error = ''
        const token = generation
        return enqueue(task).catch(error => fail(error, token))
            .finally(() => { if (active(token)) state.busy = false })
    }
    const attach = (room, inviterId) => {
        if (!room?.roomId) throw new Error('未获取到房间信息，请重试')
        state.roomId = String(room.roomId)
        state.creatorId = String(room.creatorId || '')
        state.inviterId = String(inviterId || room.creatorId || userId())
        state.users = room.roomUsers || []
        state.connectedAt = now()
        state.connection = 'connecting'
    }
    const record = id => {
        if (!id || state.history[0]?.id === id) return
        state.history = [{ id, at: now() }, ...state.history].slice(0, 50)
    }
    const readStatus = async (token, force = false) => {
        if (!force && now() - lastStatusAt < 15000) return
        const data = await call('status')
        if (!active(token)) return
        lastStatusAt = now()
        if (!data.inRoom || String(data.roomInfo?.roomId) !== state.roomId) {
            reset()
            state.error = '已离开房间或房间已结束'
            return
        }
        state.users = data.roomInfo?.roomUsers || []
        state.creatorId = String(data.roomInfo?.creatorId || state.creatorId)
    }
    const receive = async (token, force = false) => {
        const revision = localRevision
        const data = await call('sync/playlist/get', { roomId: state.roomId })
        if (!active(token)) return
        const playlist = data.playlist || {}
        versions = Array.isArray(playlist.version) ? playlist.version : versions
        sequence = Math.max(sequence, Number(data.playCommand?.clientSeq) || 0)
        // Local input during the request wins until its queued command is sent.
        if (revision !== localRevision) return
        const command = data.playCommand
        const hasCommand = /^\d+$/.test(String(command?.targetSongId || '')) && ['PLAY', 'PAUSE'].includes(command?.playStatus)
        const serverSeq = Number(command?.serverSeq) || 0
        if (hasCommand && serverSeq && serverSeq < newestServerSeq) return
        if (awaitingEcho) {
            const echoes = hasCommand && String(command.userId) === String(userId()) && Number(command.clientSeq) >= awaitingEcho.seq
            const newerRemote = hasCommand && String(command.userId) !== String(userId()) && serverSeq > awaitingEcho.at
            if (echoes) {
                seenCommand = commandIdentity(command)
                newestServerSeq = Math.max(newestServerSeq, serverSeq)
                awaitingEcho = null
                return // Our own fixed progress anchor must never seek local playback backwards.
            }
            if (!newerRemote && now() - awaitingEcho.at < 10000) return
            awaitingEcho = null
        }
        const ids = togetherIds(playlist.displayList?.result)
        const randomIds = togetherIds(playlist.randomList?.result || ids)
        const mode = playlist.playMode || state.mode
        const nextKey = JSON.stringify([ids, randomIds, mode])
        const queueChanged = Array.isArray(playlist.displayList?.result) && nextKey !== queueKey
        const identity = hasCommand ? commandIdentity(command) : ''
        const commandChanged = hasCommand && (force || identity !== seenCommand)
        if (!queueChanged && !commandChanged) return
        state.applying = true
        try {
            const receivedAt = now()
            await applyRemote({ ids: queueChanged ? ids : null, randomIds, mode,
                command: commandChanged ? command : null,
                position: () => commandPosition(command, now(), receivedAt),
            }, () => active(token) && revision === localRevision)
            if (!active(token) || revision !== localRevision) return
            if (queueChanged) { queueKey = nextKey; state.queue = ids; state.mode = mode }
            if (commandChanged) {
                seenCommand = identity
                newestServerSeq = Math.max(newestServerSeq, serverSeq)
                last = { targetSongId: String(command.targetSongId), playStatus: command.playStatus, progress: command.progress }
                record(last.targetSongId)
            }
        } finally { if (active(token)) state.applying = false }
    }
    const heartbeat = async (token, force = false) => {
        if (!force && now() - heartbeatAt < heartbeatMs) return
        const p = playback()
        const id = isTogetherSong(p.song) ? String(p.song.id) : last?.targetSongId
        if (!id) return
        const data = await call('heatbeat', { roomId: state.roomId, songId: id,
            playStatus: isTogetherSong(p.song) && p.playing ? 'PLAY' : 'PAUSE',
            progress: Math.max(0, Math.round((Number(p.progress) || 0) * 1000)) })
        if (!active(token)) return
        heartbeatAt = now()
        if (Number(data.timeSpan) > 0) heartbeatMs = Math.max(5000, Math.min(60000, Number(data.timeSpan) * 1000))
    }
    const sendPlayback = async (token, next, commandType) => {
        const seq = ++sequence
        const at = now()
        await call('play/command', { roomId: state.roomId, ...next, formerSongId: last?.targetSongId || '-1', clientSeq: seq, commandType })
        if (!active(token)) return
        last = next
        awaitingEcho = { seq, at }
        record(next.targetSongId)
        await heartbeat(token, true)
    }
    const sendLocal = async (token, seek = false) => {
        if (!state.roomId || state.applying) return
        const p = playback()
        if (!isTogetherSong(p.song)) {
            if (last && last.playStatus !== 'PAUSE') await sendPlayback(token, { ...last, playStatus: 'PAUSE' }, 'PAUSE')
            return true
        }
        if (!p.ready) return false
        const ids = togetherIds((p.songs || []).filter(isTogetherSong))
        if (!ids.includes(String(p.song.id))) ids.push(String(p.song.id))
        const mode = togetherPlayMode(p.playMode)
        const randomIds = mode === 'RANDOM' ? togetherIds((p.shuffledSongs || p.songs || []).filter(isTogetherSong)) : ids
        const key = JSON.stringify([ids, randomIds, mode])
        if (key !== queueKey) {
            const version = versions.filter(v => String(v.userId) !== String(userId()))
            const own = versions.find(v => String(v.userId) === String(userId()))
            version.push({ userId: userId(), version: (Number(own?.version) || 0) + 1 })
            await call('sync/list/command', { roomId: state.roomId, commandType: 'REPLACE', version,
                playMode: mode, displayList: ids, randomList: randomIds })
            if (!active(token)) return
            versions = version
            queueKey = key
            state.queue = ids
            state.mode = mode
        }
        const next = { targetSongId: String(p.song.id), playStatus: p.playing ? 'PLAY' : 'PAUSE', progress: Math.max(0, Math.floor((Number(p.progress) || 0) * 1000)) }
        const changedSong = !last || last.targetSongId !== next.targetSongId
        const commandType = changedSong ? 'GOTO' : seek ? 'PROGRESS' : last.playStatus !== next.playStatus ? next.playStatus : null
        if (commandType) await sendPlayback(token, next, commandType)
        if (active(token)) success()
        return true
    }
    const flushLocal = async token => {
        const revision = localRevision
        const complete = await sendLocal(token, seekRequested)
        if (active(token) && revision === localRevision && complete) { dirty = false; seekRequested = false }
    }
    const joinExisting = async (token, room, inviterId) => {
        attach(room, inviterId)
        await receive(token, true)
        if (!active(token)) return
        await heartbeat(token, true)
        if (active(token)) success()
    }
    return {
        reset,
        restore: ({ silent = false } = {}) => action(async token => {
            if (state.roomId || !userId()) return
            const data = await call('status')
            if (!active(token)) return
            if (data.inRoom) await joinExisting(token, data.roomInfo)
            else if (!silent) state.error = '账号当前没有一起听房间，可以创建一个新房间'
        }),
        create: () => action(async token => {
            if (state.roomId) return
            if (!userId()) throw new Error('请先登录网易云账号')
            const existing = await call('status')
            if (!active(token)) return
            if (existing.inRoom) { await joinExisting(token, existing.roomInfo); return }
            const data = await call('room/create')
            if (!active(token)) return
            attach(data.roomInfo)
            dirty = true
            dirtyAt = now()
            seekRequested = true
            await flushLocal(token)
        }),
        join: (text, inviterId) => action(async token => {
            if (state.roomId) return
            if (!userId()) throw new Error('请先登录网易云账号')
            const invitation = parseTogetherInvitation(text, inviterId)
            const existing = await call('status')
            if (!active(token)) return
            if (existing.inRoom) {
                await joinExisting(token, existing.roomInfo)
                if (active(token) && state.roomId !== invitation.roomId) state.error = '已恢复账号所在房间；请先退出后再加入其他房间'
                return
            }
            await call('accept', invitation)
            if (!active(token)) return
            await joinExisting(token, invitation, invitation.inviterId)
            if (active(token)) await readStatus(token, true)
        }),
        invite: acceptorId => action(async token => {
            if (!state.roomId || !/^\d+$/.test(String(acceptorId)) || Number(acceptorId) <= 0) throw new Error('请输入好友的网易云用户 ID')
            if (String(acceptorId) === String(userId())) throw new Error('不能邀请自己')
            const data = await call('invite', { roomId: state.roomId, acceptorId })
            if (!active(token)) return
            if (data.result !== true) throw new Error('邀请未发送成功，请使用邀请链接')
            state.invitationSent = true
        }),
        leave: () => action(async token => {
            if (!state.roomId) return
            await call('end', { roomId: state.roomId })
            if (active(token)) reset()
        }),
        update: ({ seek = false } = {}) => {
            if (!state.roomId || state.applying) return Promise.resolve()
            localRevision++
            dirty = true
            dirtyAt = now()
            seekRequested ||= seek
            const token = generation
            return enqueue(() => flushLocal(token)).catch(error => fail(error, token, true))
        },
        refresh: ({ force = false } = {}) => {
            const token = generation
            return enqueue(async () => {
                if (!state.roomId) return
                await readStatus(token, force)
                if (!active(token)) return
                if (dirty) {
                    await flushLocal(token)
                    if (!active(token)) return
                    if (dirty && now() - dirtyAt < 15000) return
                    dirty = false
                }
                await receive(token, force)
                if (!active(token)) return
                await heartbeat(token)
                if (active(token)) success()
            }).catch(error => fail(error, token, true))
        },
    }
}
