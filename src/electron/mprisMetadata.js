const crypto = require('crypto')

function normalizeString(value) {
  if (value === null || typeof value === 'undefined') return ''
  return String(value).trim()
}

function normalizeArtists(metadata) {
  if (Array.isArray(metadata?.artists)) {
    const artists = metadata.artists.map(normalizeString).filter(Boolean)
    if (artists.length > 0) return artists
  }

  const artist = normalizeString(metadata?.artist)
  if (!artist) return []
  return artist.split(/\s*[,/、]\s*/).map(normalizeString).filter(Boolean)
}

function createTrackObjectPath(player, rawTrackId) {
  const source = normalizeString(rawTrackId)
  const digest = crypto.createHash('sha1').update(source).digest('hex')
  return player.objectPath(`track/track_${digest}`)
}

function getArtworkUrl(metadata) {
  const artwork = Array.isArray(metadata?.artwork) ? metadata.artwork : []
  const first = artwork.find(item => normalizeString(item?.src))
  return normalizeString(first?.src)
}

function buildMprisMetadata(player, metadata) {
  if (!metadata || typeof metadata !== 'object') return null

  const title = normalizeString(metadata.title)
  const trackId = normalizeString(metadata.trackId || metadata.url || title)
  if (!trackId && !title) return null

  const nextMetadata = {
    'mpris:trackid': createTrackObjectPath(player, trackId || title),
  }

  const lengthSeconds = Number(metadata.length)
  if (Number.isFinite(lengthSeconds) && lengthSeconds > 0) {
    nextMetadata['mpris:length'] = Math.round(lengthSeconds * 1000 * 1000)
  }

  const artUrl = getArtworkUrl(metadata)
  if (artUrl) nextMetadata['mpris:artUrl'] = artUrl
  if (title) nextMetadata['xesam:title'] = title

  const album = normalizeString(metadata.album)
  if (album) nextMetadata['xesam:album'] = album

  const artists = normalizeArtists(metadata)
  if (artists.length > 0) nextMetadata['xesam:artist'] = artists

  const url = normalizeString(metadata.url)
  if (url) nextMetadata['xesam:url'] = url

  return nextMetadata
}

module.exports = {
  buildMprisMetadata,
  createTrackObjectPath,
  normalizeArtists,
  normalizeString,
}
