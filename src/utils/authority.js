import Cookies from "js-cookie";

const AUTH_COOKIE_KEYS = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T']
const AUTH_COOKIE_STORAGE_PREFIX = 'cookie:'

function getSessionStore() {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
  } catch (_) {}
  return null
}

function getLocalStore() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch (_) {}
  return null
}

function getCookieStorageKey(key) {
  return AUTH_COOKIE_STORAGE_PREFIX + key
}

function readStoredAuthCookie(key) {
  const storageKey = getCookieStorageKey(key)
  const localStore = getLocalStore()

  try {
    const localValue = localStore?.getItem(storageKey)
    if (localValue) return localValue
  } catch (_) {}

  const sessionStore = getSessionStore()
  try {
    const sessionValue = sessionStore?.getItem(storageKey)
    if (!sessionValue) return ''
    try { localStore?.setItem(storageKey, sessionValue) } catch (_) {}
    return sessionValue
  } catch (_) {
    return ''
  }
}

function writeStoredAuthCookie(key, value) {
  const storageKey = getCookieStorageKey(key)
  if (!value) {
    clearStoredAuthCookie(key)
    return
  }

  const text = String(value)
  try { getLocalStore()?.setItem(storageKey, text) } catch (_) {}
  try { getSessionStore()?.removeItem(storageKey) } catch (_) {}
}

function clearStoredAuthCookie(key) {
  const storageKey = getCookieStorageKey(key)
  try { getSessionStore()?.removeItem(storageKey) } catch (_) {}
  try { getLocalStore()?.removeItem(storageKey) } catch (_) {}
}

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
    writeStoredAuthCookie(key, value)
  })
}

export function migrateLegacyAuthSession() {
  AUTH_COOKIE_KEYS.forEach((key) => {
    void readStoredAuthCookie(key)
  })
}

export function setCookies(data) {
  const cookieSource = data?.cookie || ''
  const cookieMap = extractAuthCookieValues(cookieSource)

  // 部分接口返回只有 MUSIC_U，或者以对象字段携带
  if (!Object.keys(cookieMap).length && data?.profile && data?.token) {
    cookieMap.MUSIC_U = data.token
  }

  clearLoginCookies()
  persistAuthCookies(cookieMap)
}

// 获取 Cookie - 登录态持久化到 localStorage，并兼容当前会话中的旧值。
export function getCookie(key) {
  const storedValue = readStoredAuthCookie(key)
  if (storedValue) return storedValue
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
      clearStoredAuthCookie(k)
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
