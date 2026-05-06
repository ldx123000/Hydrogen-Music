import axios from "axios";
import { getCookie, isLogin, setCookies } from '../utils/authority'
import pinia from "../store/pinia";
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { clearAccountScopedState } from './accountState'

import { noticeOpen } from "./dialog";

const libraryStore = useLibraryStore(pinia)

const request = axios.create({
    baseURL: 'http://localhost:36530',
    withCredentials: true,
    timeout: 20000,
});

const AUTH_COOKIE_KEYS = ['token', 'userid', 'vip_type', 'vip_token', 't1', 'dfid']

let cachedAuthCookieString = null

function buildAuthCookieString() {
  if (cachedAuthCookieString !== null) {
    return cachedAuthCookieString
  }

  cachedAuthCookieString = AUTH_COOKIE_KEYS
    .map((key) => {
      const value = getCookie(key)
      return value ? `${key}=${value}` : ''
    })
    .filter(Boolean)
    .join(';')

  return cachedAuthCookieString
}

export function invalidateNcmApiCookieCache() {
  cachedAuthCookieString = null
}

let autoLoggingOut = false

function triggerAutoLogout(reason) {
  if (autoLoggingOut) return
  autoLoggingOut = true

  void clearAccountScopedState().finally(() => {
    setTimeout(() => { autoLoggingOut = false }, 1500)
  })

  const userStore = useUserStore(pinia)
  userStore.appOptionShow = false

  noticeOpen(reason || '登录状态已失效，已自动退出，请重新登录', 3)
}

request.interceptors.request.use(function (config) {
  config.params = config.params || {}
  config.headers = config.headers || {}

  const requestUrl = config.url || ''
  const skipAuthCookie = requestUrl.startsWith('/login/') || requestUrl === '/captcha/sent'

  if (!skipAuthCookie && isLogin()) {
    const authCookieString = buildAuthCookieString()
    if (authCookieString) config.headers.Authorization = authCookieString
  }

  if (libraryStore.needTimestamp.indexOf(config.url) != -1) {
    config.params.timestamp = new Date().getTime()
  }

  return config
}, function (error) {
  noticeOpen('发起请求错误', 2)
  return Promise.reject(error)
});

function persistSetCookieHeader(response) {
  const setCookieHeader = response?.headers?.['set-cookie']
  if (!setCookieHeader) return
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
  const cookieString = cookies.map(c => c.split(';')[0]).join('; ')
  if (cookieString) setCookies({ cookie: cookieString })
}

request.interceptors.response.use(function (response) {
    persistSetCookieHeader(response)
    const url = response?.config?.url || ''
    const data = response?.data

    const isAuthApi = url.startsWith('/login') || url === '/logout'
    if (!isAuthApi && data && typeof data === 'object') {
      const code = data.code
      const text = data.msg || data.message || ''
      if (code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || '')) {
        triggerAutoLogout('登录状态已失效，已自动退出')
      }
    }
    return data
  }, function (error) {
    const url = error?.config?.url || ''
    const status = error?.response?.status
    const msg = error?.response?.data?.message || error?.response?.data?.msg
    const code = error?.response?.data?.code

    if (status === 401 || status === 403) {
      triggerAutoLogout('登录已过期，请重新登录')
    } else {
      const text = error?.response?.data?.msg || error?.response?.data?.message || ''
      if (code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || '')) {
        triggerAutoLogout('登录状态已失效，已自动退出')
      }
    }

    const suppressGlobalNotice = url === '/like' || url === '/playlist/tracks' || url === '/playlist/tracks/add' || url === '/playlist/tracks/del'
    if (!suppressGlobalNotice) {
      if (msg) noticeOpen(`请求错误：${msg}`, 2)
      else if (status) noticeOpen(`请求错误 (${status})`, 2)
      else noticeOpen('请求错误', 2)
    }
    return Promise.reject(error)
  });

export default request;
