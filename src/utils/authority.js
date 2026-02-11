import Cookies from "js-cookie";

const AUTH_COOKIE_KEYS = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T']

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
  const cookieSource = data?.cookie || ''
  const cookieMap = extractAuthCookieValues(cookieSource)

  // 部分接口返回只有 MUSIC_U，或者以对象字段携带
  if (!Object.keys(cookieMap).length && data?.profile && data?.token) {
    cookieMap.MUSIC_U = data.token
  }

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
  return (getCookie('MUSIC_U') != undefined)
}

// 清理登录相关Cookie与本地存储（不影响其他设置）
export function clearLoginCookies() {
  try {
    const keys = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T']
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
