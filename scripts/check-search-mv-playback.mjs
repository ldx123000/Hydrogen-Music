import assert from 'node:assert/strict'
import { createServer } from 'vite'

const storage = new Map()
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
}

const server = await createServer({ appType: 'custom', server: { middlewareMode: true } })

try {
    const { getMVDetail, getMVUrl } = await server.ssrLoadModule('/src/api/mv.js')
    const { search } = await server.ssrLoadModule('/src/api/other.js')
    const searchResponse = await search({ keywords: '你的名字', type: 'mv', limit: 10 })
    const searchMvs = searchResponse?.result?.mvs || []
    assert.equal(searchMvs.length, 10, 'MV search should return the requested results')
    await Promise.all(searchMvs.map(async mv => {
        assert.match(mv?.cover || '', /^https?:\/\//i, 'MV search should return an absolute cover URL')
        const coverResponse = await fetch(mv.cover.replace('http://', 'https://'), { method: 'HEAD' })
        assert.ok(coverResponse.ok, `MV cover should be reachable: ${mv.name}`)
        assert.match(coverResponse.headers.get('content-type') || '', /^image\//i, `MV cover should be an image: ${mv.name}`)
    }))

    const searchMv = searchMvs[0]
    assert.ok(searchMv?.id, 'MV search should return an id')

    const detail = await getMVDetail(searchMv.id)
    assert.match(detail?.data?.hash || '', /^[a-f\d]{32}$/i, 'MV detail should select an MP4 hash')

    const qualityHashes = [
        detail.data.fhd_hash,
        detail.data.hd_hash,
        detail.data.qhd_hash,
        detail.data.sd_hash,
        detail.data.ld_hash,
    ].filter(Boolean)
    assert.ok(qualityHashes.length > 1, 'MV detail should expose multiple quality hashes')

    const urls = await Promise.all(qualityHashes.map(hash => getMVUrl({ hash })))
    urls.forEach(url => assert.match(url?.data?.url || '', /^https?:\/\/.+\.mp4(?:\?|$)/i, 'Each MV quality should resolve to an MP4 source'))

    const mediaResponse = await fetch(urls[0].data.url, { headers: { Range: 'bytes=0-31' } })
    assert.ok(mediaResponse.ok, 'MV source should be reachable')
    assert.match(mediaResponse.headers.get('content-type') || '', /^video\/mp4/i, 'MV source should be playable MP4')
    await mediaResponse.body?.cancel()
    console.log('search MV playback check passed')
} finally {
    await server.close()
}
