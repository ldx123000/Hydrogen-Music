import pinia from '../store/pinia'
import { useLocalStore } from '../store/localStore'
import { storeToRefs } from 'pinia'
import { nanoid } from 'nanoid'
import { noticeOpen } from './dialog'
import { buildLocalSongSearchText } from './songFilter'

const localStore = useLocalStore(pinia)
const { downloadedMusicFolder, downloadedFiles, localMusicFolder, localMusicList, localMusicClassify, isRefreshLocalFile } = storeToRefs(localStore)

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

function buildFolderIndex(metadataRoot) {
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

function buildLocalClassify(flatSongs = []) {
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

export function scanMusic(params) {
    if(isRefreshLocalFile.value)
        noticeOpen("正在扫描本地音乐,请稍等", 3)
    windowApi.scanLocalMusic(params)
}

windowApi.localMusicCount((event, count) => {
    noticeOpen('已扫描' + count + '首', 2)
})

windowApi.localMusicFiles((event, localData) => {
    if(localData.type == 'downloaded') {
        downloadedMusicFolder.value = localData.dirTree
        downloadedFiles.value = localData.locaFilesMetadata

        const downloadedIndex = buildFolderIndex(localData.locaFilesMetadata)
        localStore.updateLookupIndex('downloaded', {
            foldersByName: downloadedIndex.foldersByName,
            songSearchById: downloadedIndex.songSearchById,
        })
    }

    if(localData.type == 'local') {
        localMusicFolder.value = localData.dirTree
        localMusicList.value = localData.locaFilesMetadata

        const localIndex = buildFolderIndex(localData.locaFilesMetadata)
        const localClassify = buildLocalClassify(localIndex.flatSongs)
        localMusicClassify.value = {
            artists: localClassify.artists,
            albums: localClassify.albums,
        }

        localStore.updateLookupIndex('local', {
            foldersByName: localIndex.foldersByName,
            songSearchById: localIndex.songSearchById,
            artistsById: localClassify.artistsById,
            albumsById: localClassify.albumsById,
        })
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
