export function withCoverParam(url, size = 512) {
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    if (!normalizedUrl) return '';
    if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return normalizedUrl;

    const nextParam = `param=${size}y${size}`;
    if (/(?:\?|&)param=\d+y\d+/.test(normalizedUrl)) {
        return normalizedUrl.replace(/([?&])param=\d+y\d+/, `$1${nextParam}`);
    }

    return `${normalizedUrl}${normalizedUrl.includes('?') ? '&' : '?'}${nextParam}`;
}

export function buildCoverBackdropCandidates(song, localBase64Img, { size = 512, includeAlbumPicUrl = false } = {}) {
    if (!song) return [];
    if (song.type === 'local') return localBase64Img ? [localBase64Img] : [];

    const candidates = [];
    const pushCandidate = url => {
        const normalizedUrl = typeof url === 'string' ? url.trim() : '';
        if (!normalizedUrl) return;

        const sizedUrl = withCoverParam(normalizedUrl, size);
        if (sizedUrl && !candidates.includes(sizedUrl)) candidates.push(sizedUrl);
        if (sizedUrl !== normalizedUrl && !candidates.includes(normalizedUrl)) candidates.push(normalizedUrl);
    };

    [
        song.blurPicUrl,
        song.coverDeUrl,
        song.coverUrl,
        song.al?.picUrl,
        includeAlbumPicUrl ? song.album?.picUrl : '',
        song.img1v1Url,
    ].forEach(pushCandidate);

    return candidates;
}
