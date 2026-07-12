import request from "../utils/request";

function toArray(value) {
    return Array.isArray(value) ? value : value ? [value] : []
}

function toTimestamp(value) {
    if (!value) return 0
    const parsedNumber = Number(value)
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
        return parsedNumber < 1e12 ? parsedNumber * 1000 : parsedNumber
    }
    const parsedDate = Date.parse(value)
    return Number.isNaN(parsedDate) ? 0 : parsedDate
}

function resolveCover(url) {
    if (typeof url != 'string' || url === '') return ''
    return url.includes('{size}') ? url.replace('{size}', '480') : url
}

function normalizeMvArtists(raw = {}) {
    const artistList = Array.isArray(raw?.artists)
        ? raw.artists
        : Array.isArray(raw?.authors)
            ? raw.authors
            : raw?.author_name || raw?.singername || raw?.SingerName
                ? [{ name: raw?.author_name || raw?.singername || raw?.SingerName }]
                : []

    const normalized = artistList
        .map((item, index) => {
            if (!item) return null
            const name = item?.name || item?.author_name || item?.singername || item?.userName || ''
            if (!name) return null
            return {
                id: String(item?.id || item?.author_id || item?.singerid || `${index}`),
                name,
            }
        })
        .filter(Boolean)

    if (normalized.length > 0) return normalized

    return toArray(raw?.creator)
        .map((item, index) => {
            const name = item?.userName || item?.name || ''
            if (!name) return null
            return {
                id: String(item?.userId || item?.id || `${index}`),
                name,
            }
        })
        .filter(Boolean)
}

function normalizeMV(raw = {}, extra = {}) {
    const cover = resolveCover(raw.imgurl || raw.cover || raw.sizable_cover || raw.pic || raw.Pic || raw.ThumbGif || '')
    const artists = normalizeMvArtists(raw)
    const videoId = raw.vid || raw.video_id || raw.MvID || raw.id || raw.mvhash || raw.videoid || ''
    const hash = raw.hd_hash || raw.qhd_hash || raw.sd_hash || raw.ld_hash || raw.hash || raw.video_hash || raw.mvhash || raw.MvHash || ''

    return {
        ...raw,
        id: String(videoId || ''),
        vid: String(videoId || ''),
        videoId: String(videoId || ''),
        hash: String(hash || ''),
        name: raw.video_name || raw.name || raw.MvName || '未知 MV',
        cover,
        coverUrl: cover,
        imgurl: cover,
        picUrl: cover,
        publishTime: toTimestamp(raw.publish_date || raw.publishTime || raw.PublishDate),
        artists,
        creator: artists.map(artist => ({ userName: artist.name })),
        artistName: artists.map(artist => artist.name).join(' / '),
        desc: raw.description || raw.desc || raw.intro || '',
        briefDesc: raw.briefDesc || raw.description || raw.desc || raw.intro || '',
        playCount: Number(raw.play_count ?? raw.playcnt ?? raw.playCount ?? 0) || 0,
        subCount: Number(raw.collect_count ?? raw.subCount ?? raw.collectCount ?? 0) || 0,
        brs: toArray(raw?.resolution || raw?.brs || raw?.resolutions)
            .map(item => {
                const br = Number(item?.br || item?.resolution || item?.size || item)
                if (!Number.isFinite(br) || br <= 0) return null
                return { br }
            })
            .filter(Boolean),
        source: 'kugou',
        ...extra,
    }
}

/**
 * 获取用户收藏的视频列表。
 */
export function getUserSubMV({ pagesize = 50, page = 1 } = {}) {
    return request({
        url: '/user/video/collect',
        method: 'get',
        params: { pagesize, page },
    }).then(result => {
        const list = toArray(result?.data?.list || result?.data || result)
        const data = list.map(item => normalizeMV(item))
        return {
            ...result,
            data,
        }
    })
}

/**
 * 获取歌手 MV 列表。
 */
export function getArtistMV(params = {}) {
    return request({
        url: '/artist/videos',
        method: 'get',
        params: {
            id: params?.id,
            page: params?.page || 1,
            pagesize: params?.pagesize || params?.limit || 50,
            tag: params?.tag || 'all',
        },
    }).then(result => {
        const list = toArray(result?.data || result?.data?.list || result?.list || result)
        const mvs = list.map(item => normalizeMV(item))
        return {
            ...result,
            mvs,
            data: mvs,
        }
    })
}

/**
 * 获取视频详情。
 */
export function getMVDetail(id) {
    return request({
        url: '/video/detail',
        method: 'get',
        params: { id },
    }).then(result => {
        const detail = toArray(result?.data || result?.list || result)[0] || result?.data || result || {}
        return {
            ...result,
            data: normalizeMV(detail),
        }
    })
}

/**
 * 获取视频播放地址。
 * 酷狗新版接口通过视频 hash 取地址，保留第二个参数仅为了兼容旧调用。
 */
export function getMVUrl(input, _r) {
    const hash = typeof input === 'object'
        ? String(input?.hash || input?.video_hash || input?.mvhash || '')
        : String(input || '')

    return request({
        url: '/video/url',
        method: 'get',
        params: { hash },
    }).then(result => {
        const hashData = result?.data?.[hash.toLowerCase()] || result?.data?.[hash] || {}
        return {
            ...result,
            data: {
                url: result?.data?.url || result?.url || hashData?.downurl || toArray(hashData?.backupdownurl)[0] || '',
                hash,
            },
        }
    })
}
