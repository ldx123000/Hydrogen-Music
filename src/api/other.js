import request from "../utils/request";

function toArray(value) {
    return Array.isArray(value) ? value : value ? [value] : []
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function resolveSearchImage(url, size = '480') {
    if (typeof url != 'string' || url === '') return ''
    return url.includes('{size}') ? url.replace('{size}', size) : url
}

function splitArtistNames(value) {
    return String(value || '')
        .split(/[、,/&]/)
        .map(name => name.trim())
        .filter(Boolean)
}

function normalizeSearchArtists(rawArtists, fallbackArtistName = '') {
    const sourceList = Array.isArray(rawArtists) ? rawArtists : rawArtists ? [rawArtists] : []
    const normalized = sourceList
        .flatMap(item => {
            if (!item) return []
            if (typeof item == 'string') {
                return splitArtistNames(item).map(name => ({ name }))
            }
            return [item]
        })
        .map((item, index) => {
            const name = item?.name || item?.singername || item?.author_name || item?.nickname || ''
            if (!name) return null
            return {
                id: String(item?.id || item?.singerid || item?.author_id || `${index}`),
                name,
            }
        })
        .filter(Boolean)

    if (normalized.length > 0) return normalized

    return splitArtistNames(fallbackArtistName).map((name, index) => ({
        id: `search-artist-${index}`,
        name,
    }))
}

function normalizeSearchDuration(raw = {}) {
    const duration = raw.dt ?? raw.duration ?? raw.timelength ?? raw.timelen ?? raw.time_length ?? raw.timeLength ?? raw.duration_ms ?? raw.audio_info?.duration ?? raw.audio_info?.duration_128 ?? raw.audio_info?.duration_320 ?? raw.audio_info?.duration_flac ?? 0
    const parsed = Number(duration)
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    return parsed < 1000 ? parsed * 1000 : parsed
}

function normalizeSearchSong(item = {}) {
    const base = item.base || item.audio_info || {}
    const rawArtists = item.singerinfo || item.authors || base.authors || item.singers || item.Singers || item.SingerName || item.author_name || base.author_name
    const fallbackArtistName = item.author_name || item.singername || base.author_name || ''
    const artists = normalizeSearchArtists(rawArtists, fallbackArtistName)
    const cover = resolveSearchImage(
        item.imgurl || item.cover || item.sizable_cover || item.album_img || item.Image ||
        item.trans_param?.union_cover || item.albuminfo?.pic || item.album_info?.cover || base.union_cover
    )

    let songName = item.song_name || item.audio_name || base.audio_name || item.songname || item.filename || item.fileName || item.FileName || item.name || ''
    if (!songName && item.name) songName = item.name
    if (songName.includes(' - ') && !item.song_name && !item.audio_name) {
        const parts = songName.split(' - ')
        songName = parts[parts.length - 1]?.trim() || songName
    }
    songName = String(songName || '未知歌曲').replace(/\.(mp3|flac|ogg|aac|wav|m4a|wma|ape|opus)$/i, '')

    const albumId = item.album_id || item.albumid || item.albumId || item.AlbumID || item.albuminfo?.id || item.album_info?.album_id || base.album_id || base.album_audio_id || ''
    const albumName = item.album_name || item.album || item.albumname || item.AlbumName || item.albuminfo?.name || item.album_info?.album_name || base.album_name || '未知专辑'
    const fallbackId = item.hash || item.FileHash || item.file_hash || item.id || item.song_id || item.audio_id || item.Audioid || item.fileid || base.hash || base.audio_id || base.album_audio_id || `${Date.now()}`
    const hash = item.hash || item.FileHash || item.file_hash || base.hash || fallbackId
    const duration = normalizeSearchDuration(item)

    return {
        ...item,
        id: String(item.mixsongid || item.mixsong_id || item.album_audio_id || item.audio_id || item.Audioid || item.song_id || fallbackId),
        hash: String(hash || ''),
        fileid: String(item.fileid || item.fileId || item.Audioid || base.audio_id || fallbackId),
        mixsongid: item.mixsongid || item.mixsong_id || item.album_audio_id || base.album_audio_id || '',
        album_audio_id: item.album_audio_id || item.mixsongid || item.mixsong_id || base.album_audio_id || '',
        name: songName,
        alia: item.ori_song_name ? [item.ori_song_name] : [],
        ar: artists,
        artists,
        al: {
            id: String(albumId || ''),
            name: albumName,
            picUrl: cover,
            blurPicUrl: cover,
        },
        album: {
            id: String(albumId || ''),
            name: albumName,
            picUrl: cover,
        },
        dt: duration,
        duration,
        mv: item.mvhash || item.video_id || item.mvid || item.MvID || item.mvdata?.id || base?.video_id || null,
        fee: toNumber(item.fee, 0),
        st: toNumber(item.st, 0),
        privilege: item.privilege || { pl: 0, fee: 0, st: 0 },
        song: { artists },
        picUrl: cover,
        coverUrl: cover,
        source: 'kugou',
        type: 'search',
    }
}

function normalizeSearchType(type) {
    const typeMap = {
        1: 'song',
        10: 'album',
        100: 'author',
        1000: 'special',
        1004: 'mv',
        song: 'song',
        album: 'album',
        author: 'author',
        artist: 'author',
        special: 'special',
        playlist: 'special',
        mv: 'mv',
    }

    return typeMap[type] || 'song'
}

function extractSearchList(result) {
    return toArray(
        result?.data?.lists ||
        result?.data?.list ||
        result?.data?.info ||
        result?.data?.items ||
        result?.data?.data?.lists ||
        result?.data?.data ||
        result?.list ||
        result?.items
    )
}

function normalizeSearchAlbum(item = {}) {
    const cover = resolveSearchImage(
        item.cover || item.sizable_cover || item.imgurl || item.album_img || item.img || item.Image
    )

    return {
        ...item,
        id: String(item.album_id || item.albumid || item.AlbumID || item.id || ''),
        name: item.album_name || item.albumname || item.name || '未知专辑',
        blurPicUrl: cover,
        picUrl: cover,
        size: toNumber(item.total || item.size || item.songcount || item.song_count || 0),
        publishTime: item.publish_date || item.publishDate || item.publish_time || item.public_time || 0,
    }
}

function normalizeSearchArtist(item = {}) {
    const avatar = resolveSearchImage(item.Avatar || item.imgurl || item.sizable_avatar || item.avatar || item.FirstFrameImage)

    return {
        ...item,
        id: String(item.AuthorId || item.author_id || item.singerid || item.id || ''),
        name: item.AuthorName || item.author_name || item.singername || item.name || '未知歌手',
        img1v1Url: avatar,
        picUrl: avatar,
        musicSize: toNumber(item.AudioCount || item.songcount || item.song_count || 0),
        albumSize: toNumber(item.AlbumCount || item.albumcount || item.album_count || 0),
        mvSize: toNumber(item.VideoCount || item.mvcount || item.mv_count || 0),
    }
}

function normalizeSearchPlaylist(item = {}) {
    const cover = resolveSearchImage(item.pic || item.img || item.cover || item.sizable_cover || item.imgurl || item.image || item.picUrl)

    return {
        ...item,
        id: String(item.global_collection_id || item.gid || item.listid || item.id || item.specialid || ''),
        name: item.list_name || item.specialname || item.name || '未知歌单',
        coverImgUrl: cover,
        blurPicUrl: cover,
    }
}

function normalizeSearchMv(item = {}) {
    const pic = String(item.Pic || '')
    const kugouPic = /^\d{8}.+\.[a-z]+$/i.test(pic) ? `https://imge.kugou.com/mvhdpic/400/${pic.slice(0, 8)}/${pic}` : pic
    const cover = resolveSearchImage(item.imgurl || item.cover || item.sizable_cover || item.pic || item.ThumbGif || kugouPic)

    return {
        ...item,
        id: String(item.vid || item.video_id || item.MvID || item.id || ''),
        vid: String(item.vid || item.video_id || item.MvID || item.id || ''),
        hash: String(item.hash || item.video_hash || item.mvhash || item.MvHash || ''),
        name: item.video_name || item.name || item.MvName || '未知视频',
        cover,
        picUrl: cover,
    }
}

function buildSearchResult(type, rawList) {
    const response = {
        result: {
            songs: [],
            albums: [],
            artists: [],
            playlists: [],
            mvs: [],
        },
    }

    if (type == 'song') {
        response.result.songs = rawList.map(item => normalizeSearchSong(item))
    } else if (type == 'album') {
        response.result.albums = rawList.map(item => normalizeSearchAlbum(item))
    } else if (type == 'author') {
        response.result.artists = rawList.map(item => normalizeSearchArtist(item))
    } else if (type == 'special') {
        response.result.playlists = rawList.map(item => normalizeSearchPlaylist(item))
    } else if (type == 'mv') {
        response.result.mvs = rawList.map(item => normalizeSearchMv(item))
    }

    return response
}

/**
 * 调用此接口获取轮播图（酷狗 /pc/diantai），
 * 并将响应归一化为 Banner 组件期望的 NetEase 格式。
 */
export function getBanner() {
    return request({
        url: '/pc/diantai',
        method: 'get',
        params: {}
    }).then(data => {
        // 酷狗 adservice 返回的数据可能在多处嵌套
        const rawList = toArray(
            data?.data?.list ||
            data?.data?.data ||
            data?.data?.ads ||
            data?.data?.banner ||
            data?.data ||
            data?.list ||
            data?.ads ||
            []
        )

        const banners = rawList.map(item => {
            // 提取图片：酷狗广告服务常用 img_url / code / pic 等字段
            const pic = item.img_url || item.code || item.pic || item.imageUrl || item.img || item.image || ''
            // 提取跳转链接
            const url = item.url || item.extra?.url || item.jump_url || item.link || ''
            // 跳转类型
            const jumpType = item.jump_type || item.targetType || item.type || ''
            // 标题
            const typeTitle = item.title || item.name || item.typeTitle || item.ad_name || ''

            return {
                ...item,
                pic,
                imageUrl: pic,
                url,
                targetType: jumpType,
                targetId: item.id || item.targetId || item.target_id || '',
                typeTitle,
                bannerId: item.id || item.bannerId || item.ad_id || '',
                titleColor: item.titleColor || item.title_color || item.color || '',
            }
        })

        return { banners }
    })
}

/**
 * 酷狗搜索接口适配层。
 * 前端内部仍沿用旧的数值 type，但请求时会自动映射成酷狗需要的字符串类型，
 * 并统一整理成 searchResult 所需的 result.* 结构。
 * @param {*} params
 * @returns 
 */
export function search(params) {
    const normalizedType = normalizeSearchType(params?.type)
    const pagesize = Number(params?.limit || params?.pagesize || 30)

    return request({
        url: '/search',
        method: 'get',
        params: {
            keywords: params?.keywords || '',
            type: normalizedType,
            page: params?.page || 1,
            pagesize,
        },
    })
        .then(result => buildSearchResult(normalizedType, extractSearchList(result)))
}

/**
 * 说明 : 调用此接口,可获取热门搜索列表(详细)
 * @param {*} params
 * @returns
 */
export function searchHotDetail(params = {}) {
    return request({
        url: '/search/hot',
        method: 'get',
        params,
    })
}

/**
 * 说明 : 调用此接口,传入搜索关键词可获得搜索建议
 * 必选参数 : keywords : 关键词
 * 可选参数 : type : 如果传 'mobile' 则返回移动端关键词流
 * @param {*} params
 * @returns
 */
export function searchSuggest(keywords) {
    return request({
        url: '/search/suggest',
        method: 'get',
        params: { keywords },
    })
}
