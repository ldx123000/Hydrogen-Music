const commentCountCache = new Map()

export function readCommentCountCache(key) {
    return commentCountCache.has(key) ? commentCountCache.get(key) : null
}

export function writeCommentCountCache(key, total) {
    if (!key) return
    const count = Number(total)
    commentCountCache.set(key, Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
}
