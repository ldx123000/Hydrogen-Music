import { get, getWithPagination } from './base'

// 获取我订阅的电台列表
export function getDjSubList({ limit = 30, offset = 0 } = {}) {
  return getWithPagination('/dj/sublist', { limit, offset })
}

// 订阅/取消订阅电台
export function subDj(rid, isSubscribe = true) {
  const t = isSubscribe ? 1 : 0
  return get('/dj/sub', { rid, t, timestamp: new Date().getTime() })
}

// 电台详情
export function getDjDetail(rid) {
  return get('/dj/detail', { rid })
}

// 电台节目列表
export function getDjPrograms(rid, { limit = 30, offset = 0, asc = false } = {}) {
  return get('/dj/program', { rid, limit, offset, asc })
}

// 节目评论（电台节目）
export function getDjProgramComments(id, { limit = 20, offset = 0, before } = {}) {
  const params = { id, limit, offset }
  if (before) params.before = before
  params.timestamp = new Date().getTime()
  return get('/comment/dj', params)
}

export function postDjProgramComment(id, content, commentId = null) {
  const params = {
    id,
    t: 1, // 发送
    type: 4, // 4 = 电台节目
    content,
    timestamp: new Date().getTime()
  }
  if (commentId) params.commentId = commentId
  return get('/comment', params)
}

export function likeDjProgramComment(id, cid, isLike = true) {
  const params = {
    id,
    cid,
    t: isLike ? 1 : 0,
    type: 4, // 电台节目
    timestamp: new Date().getTime()
  }
  return get('/comment/like', params)
}
