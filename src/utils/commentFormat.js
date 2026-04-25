export const formatCommentTime = timestamp => {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || ts <= 0) return '刚刚'

    const now = Date.now()
    const diff = now - ts

    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const month = 30 * day
    const year = 365 * day

    if (diff < minute) {
        return '刚刚'
    } else if (diff < hour) {
        return `${Math.floor(diff / minute)}分钟前`
    } else if (diff < day) {
        return `${Math.floor(diff / hour)}小时前`
    } else if (diff < month) {
        return `${Math.floor(diff / day)}天前`
    } else if (diff < year) {
        return `${Math.floor(diff / month)}个月前`
    } else {
        return `${Math.floor(diff / year)}年前`
    }
}
