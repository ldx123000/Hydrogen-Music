const commentScrollPositionMap = new Map();
let lastCommentTargetKey = null;

export function setCommentScrollPosition(targetKey, scrollTop) {
    if (!targetKey) return;
    const normalized = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
    commentScrollPositionMap.set(targetKey, normalized);
}

export function getCommentScrollPosition(targetKey) {
    if (!targetKey) return null;
    const cached = commentScrollPositionMap.get(targetKey);
    return typeof cached === 'number' ? cached : null;
}

export function setLastCommentTargetKey(targetKey) {
    lastCommentTargetKey = targetKey || null;
}

export function getLastCommentTargetKey() {
    return lastCommentTargetKey;
}
