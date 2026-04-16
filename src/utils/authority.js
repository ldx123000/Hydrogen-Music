import Cookies from "js-cookie";

const AUTH_COOKIE_KEYS = ['token', 'userid', 'vip_type', 'vip_token', 't1', 'dfid']

function extractAuthCookieValues(rawCookie) {
  const cookieText = String(rawCookie || '')
  const cookieMap = {}

  AUTH_COOKIE_KEYS.forEach((key) => {
    const matcher = new RegExp(`(?:^|[;\\s,])${key}=([^;\\s,]+)`)
    const match = cookieText.match(matcher)
    if (match && match[1]) {
      cookieMap[key] = match[1]
    }
  })

  return cookieMap
}

function persistAuthCookies(cookieMap) {
  Object.entries(cookieMap).forEach(([key, value]) => {
    if (!value) return
    try { document.cookie = `${key}=${value}; path=/`; } catch (_) {}
    try { localStorage.setItem('cookie:' + key, value) } catch (_) {}
  })
}

export function setCookies(data) {
  const cookieMap = {}

  const cookieSource = data?.cookie || ''
  Object.assign(cookieMap, extractAuthCookieValues(cookieSource))

  // 兼容 KuGou 返回字段：data.token / data.userid
  const token = data?.token || data?.data?.token || ''
  const userid = data?.userid || data?.data?.userid || ''
  const vipType = data?.vip_type || data?.data?.vip_type || ''
  const vipToken = data?.vip_token || data?.data?.vip_token || ''
  const t1 = data?.t1 || data?.data?.t1 || ''

  if (token) cookieMap.token = String(token)
  if (userid) cookieMap.userid = String(userid)
  if (vipType !== '') cookieMap.vip_type = String(vipType)
  if (vipToken) cookieMap.vip_token = String(vipToken)
  if (t1) cookieMap.t1 = String(t1)

  clearLoginCookies()
  persistAuthCookies(cookieMap)
}

//获取Cookie - 优先从localStorage读取，确保在Electron中的可靠性
export function getCookie(key) {
  // 直接从localStorage读取，这是更可靠的方式
  const localStorageValue = localStorage.getItem('cookie:' + key)
  if (localStorageValue) {
    return localStorageValue
  }
  // 作为备用，尝试从document.cookie读取
  return Cookies.get(key)
}

//判断是否登录
export function isLogin() {
  const token = getCookie('token')
  const userid = getCookie('userid')
  return token != undefined && userid != undefined
}

// 清理登录相关Cookie与本地存储（不影响其他设置）
export function clearLoginCookies() {
  try {
    const keys = AUTH_COOKIE_KEYS
    keys.forEach((k) => {
      // 移除 localStorage 中持久化的 cookie 值
      try { localStorage.removeItem('cookie:' + k) } catch (_) {}
      // 通过设置过期来移除浏览器 cookie
      try {
        document.cookie = `${k}=; Max-Age=0; path=/`;
        // 兼容可能的 domain/path 组合
        const hostParts = location.hostname.split('.')
        if (hostParts.length > 1) {
          const rootDomain = `.${hostParts.slice(-2).join('.')}`
          document.cookie = `${k}=; Max-Age=0; path=/; domain=${rootDomain}`
        }
      } catch (_) {}
    })
  } catch (_) {}
}
