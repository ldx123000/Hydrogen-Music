import pinia from '../store/pinia'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { nanoid } from 'nanoid'
import { noticeOpen } from './dialog'
import { buildLocalSongSearchText } from './songFilter'

const localStore = useLocalStore(pinia)
const { downloadedMusicFolder, downloadedFiles, localMusicFolder, localMusicList, localMusicClassify, isRefreshLocalFile } = storeToRefs(localStore)
const pendingScanTypes = new Set()
let bridgeInitialized = false
let removeLocalMusicCountListener = null
let removeLocalMusicFilesListener = null

function normalizeArtists(song) {
    const artists = song?.common?.artists
    if (!Array.isArray(artists) || artists.length === 0) return ['其他']

    if (artists.length === 1 && typeof artists[0] == 'string' && artists[0].includes(',')) {
        const splitArtists = artists[0].split(',').map(item => item.trim()).filter(Boolean)
        if (splitArtists.length > 0) return splitArtists
    }

    return artists.map(item => String(item || '').trim()).filter(Boolean)
}

function normalizeAlbum(song) {
    const albumName = String(song?.common?.album || '').trim()
    return albumName || '其他'
}

function getPayloadMetadata(localData) {
    return localData?.locaFilesMetadata || localData?.localFilesMetadata
}

export function buildFolderIndex(metadataRoot) {
    const foldersByName = {}
    const songSearchById = {}

    const walk = (node) => {
        if (!node || !Array.isArray(node.children)) return []

        const aggregatedSongs = []
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i]
            if (child && Array.isArray(child.children)) {
                aggregatedSongs.push(...walk(child))
            } else if (child) {
                aggregatedSongs.push(child)
                if (child.id) {
                    songSearchById[String(child.id)] = buildLocalSongSearchText(child)
                }
            }
        }

        if (node.name && !foldersByName[node.name]) {
            foldersByName[node.name] = {
                name: node.name,
                dirPath: node.dirPath,
                songs: aggregatedSongs.slice(),
            }
        }

        return aggregatedSongs
    }

    const roots = Array.isArray(metadataRoot) ? metadataRoot : [metadataRoot]
    const flatSongs = []
    roots.forEach(root => {
        flatSongs.push(...walk(root))
    })

    return {
        foldersByName,
        songSearchById,
        flatSongs,
    }
}

export function buildLocalClassify(flatSongs = []) {
    const artistMap = new Map()
    const albumMap = new Map()

    flatSongs.forEach(song => {
        const artists = normalizeArtists(song)
        artists.forEach(artist => {
            const artistKey = artist || '其他'
            if (!artistMap.has(artistKey)) {
                artistMap.set(artistKey, {
                    id: nanoid(),
                    type: 'artist',
                    name: artistKey,
                    songs: [],
                })
            }
            artistMap.get(artistKey).songs.push(song)
        })

        const albumName = normalizeAlbum(song)
        if (!albumMap.has(albumName)) {
            albumMap.set(albumName, {
                id: nanoid(),
                type: 'album',
                name: albumName,
                songs: [],
            })
        }
        albumMap.get(albumName).songs.push(song)
    })

    const artists = Array.from(artistMap.values())
    const albums = Array.from(albumMap.values())

    return {
        artists,
        albums,
        artistsById: artists.reduce((result, artist) => {
            result[String(artist.id)] = artist
            return result
        }, {}),
        albumsById: albums.reduce((result, album) => {
            result[String(album.id)] = album
            return result
        }, {}),
    }
}

export function buildDerivedPayload(type, metadataRoot) {
    const folderIndex = buildFolderIndex(metadataRoot)
    if (type === 'downloaded') {
        return {
            lookupIndex: {
                foldersByName: folderIndex.foldersByName,
                songSearchById: folderIndex.songSearchById,
            },
            classify: null,
        }
    }

    const localClassify = buildLocalClassify(folderIndex.flatSongs)
    return {
        lookupIndex: {
            foldersByName: folderIndex.foldersByName,
            songSearchById: folderIndex.songSearchById,
            artistsById: localClassify.artistsById,
            albumsById: localClassify.albumsById,
        },
        classify: {
            artists: localClassify.artists,
            albums: localClassify.albums,
        },
    }
}

function ensureDerivedPayload(type, localData) {
    const cachedDerived = localData?.derived
    if (cachedDerived?.lookupIndex) {
        if (type === 'downloaded') return cachedDerived
        if (cachedDerived?.classify?.artists && cachedDerived?.classify?.albums) return cachedDerived
    }

    const nextDerived = buildDerivedPayload(type, getPayloadMetadata(localData))
    try {
        windowApi.persistLocalMusicDerived({
            type,
            derived: nextDerived,
        })
    } catch (_) {}
    return nextDerived
}

function applyDownloadedPayload(localData, derived) {
    downloadedMusicFolder.value = localData.dirTree
    downloadedFiles.value = getPayloadMetadata(localData)

    localStore.updateLookupIndex('downloaded', {
        foldersByName: derived?.lookupIndex?.foldersByName || {},
        songSearchById: derived?.lookupIndex?.songSearchById || {},
    })
}

function applyLocalPayload(localData, derived) {
    localMusicFolder.value = localData.dirTree
    localMusicList.value = getPayloadMetadata(localData)
    localMusicClassify.value = {
        artists: derived?.classify?.artists || [],
        albums: derived?.classify?.albums || [],
    }

    localStore.updateLookupIndex('local', {
        foldersByName: derived?.lookupIndex?.foldersByName || {},
        songSearchById: derived?.lookupIndex?.songSearchById || {},
        artistsById: derived?.lookupIndex?.artistsById || {},
        albumsById: derived?.lookupIndex?.albumsById || {},
    })
}

export function scanMusic(params) {
    initLocalMusicBridge()

    const type = params?.type
    const refresh = params?.refresh === true
    if (!type) return
    if (!refresh && pendingScanTypes.has(type)) return

    pendingScanTypes.add(type)
    if(isRefreshLocalFile.value)
        noticeOpen("正在扫描本地音乐,请稍等", 3)
    windowApi.scanLocalMusic(params)
}

export function initLocalMusicBridge() {
    if (bridgeInitialized) return
    bridgeInitialized = true

    removeLocalMusicCountListener = windowApi.localMusicCount((event, count) => {
        noticeOpen('已扫描' + count + '首', 2)
    })

    removeLocalMusicFilesListener = windowApi.localMusicFiles((event, localData) => {
        if (!localData?.type) return
        pendingScanTypes.delete(localData.type)

        if(localData.type == 'downloaded') {
            const derived = ensureDerivedPayload('downloaded', localData)
            applyDownloadedPayload(localData, derived)
        }

        if(localData.type == 'local') {
            const derived = ensureDerivedPayload('local', localData)
            applyLocalPayload(localData, derived)
        }

        if(isRefreshLocalFile.value) {
            if(localData.type == 'downloaded') {
                noticeOpen("下载目录已更新，共" + localData.count + '首音乐', 3)
            } else {
                noticeOpen("扫描完毕 共" + localData.count + '首', 3)
            }
            isRefreshLocalFile.value = false
        }
    })
}

export function destroyLocalMusicBridge() {
    removeLocalMusicCountListener?.()
    removeLocalMusicFilesListener?.()
    removeLocalMusicCountListener = null
    removeLocalMusicFilesListener = null
    bridgeInitialized = false
    pendingScanTypes.clear()
}
