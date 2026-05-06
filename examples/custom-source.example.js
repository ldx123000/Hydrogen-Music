const SOURCE_API = 'https://example.com/resolve'

module.exports = {
    name: 'Example Custom Source',
    version: '1.0.0',

    async resolve({ song, quality, request }) {
        const artistNames = Array.isArray(song.ar)
            ? song.ar.map(artist => artist && artist.name).filter(Boolean)
            : []

        const payload = await request(SOURCE_API, {
            params: {
                id: song.id,
                name: song.name,
                artists: artistNames.join(','),
                quality,
            },
        })

        if (!payload || !payload.url) return null

        return {
            url: payload.url,
            level: payload.level || quality,
            type: payload.type || 'mp3',
            br: payload.br || 0,
            sr: payload.sr || 0,
            size: payload.size || 0,
        }
    },
}
