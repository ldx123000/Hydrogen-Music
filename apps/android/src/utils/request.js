import axios from "axios";
import { getCookie, isLogin } from '../utils/authority'
import pinia from "../store/pinia";
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'
import { clearAccountScopedState } from './accountState'

const libraryStore = useLibraryStore(pinia)

import { noticeOpen } from "./dialog";

const DESKTOP_API_BASE = 'http://localhost:36530'
// App 内嵌 Node 运行时暴露的转发端口（见 mobile-runtime/index.js）。
// 这里必须用 127.0.0.1 而不是 localhost：Android 上 localhost 可能优先解析到
// IPv6 的 ::1，而运行时只监听 IPv4，会导致连接被拒（表现为"API 请求错误"）。
const NATIVE_APP_API_BASE = 'http://127.0.0.1:36531'

// 同一份前端代码要跑在三种环境里：Electron 桌面端、手机浏览器、原生 App。
// 三者拿到 NCM API 的方式不同，这里按运行时分流。
function resolveApiBaseURL() {
  const isDesktopRuntime = typeof windowApi !== 'undefined'
    && typeof windowApi.requestNcmApi === 'function'
  if (isDesktopRuntime) return DESKTOP_API_BASE

  if (isNativeAppRuntime()) return NATIVE_APP_API_BASE

  // 浏览器端由同源服务把 /api 反向代理到内置 NCM API（见 server/mobile-server.cjs）
  const injected = typeof window !== 'undefined' ? window.__HM_API_BASE__ : ''
  if (typeof injected === 'string' && injected) return injected.replace(/\/+$/, '')
  return '/api'
}

const request = axios.create({
  baseURL: resolveApiBaseURL(),
  withCredentials: true,
  timeout: 10000,
});
const AUTH_COOKIE_KEYS = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T', '__csrf']
const NCM_API_READY_TIMEOUT_MS = 10000
let ncmApiReadyPromise = null
const defaultAdapter = typeof axios.getAdapter === 'function'
  ? axios.getAdapter(axios.defaults.adapter)
  : null

function waitWithTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('ncm-api-ready-timeout'))
    }, timeoutMs)

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

// ---- 原生 App：等内嵌 Node 转发层就绪 ----
// App 冷启动时 WebView 会立刻加载并发起请求，而内嵌 Node 运行时（libnode + 网易云 API）
// 需要 1~3 秒才监听端口，首批请求会全部 Network Error 且不会自动重试——
// 用户看到的就是"进去之后像连不到网"。这里在发首个请求前先探测端口是否已在监听。
const NATIVE_BRIDGE_PROBE_TIMEOUT_MS = 20000
const NATIVE_BRIDGE_PROBE_INTERVAL_MS = 300
const NATIVE_BRIDGE_PROBE_SINGLE_TIMEOUT_MS = 1500

function isNativeAppRuntime() {
  return typeof window !== 'undefined'
    && (window.__HM_APP__ === true || window.Capacitor?.isNativePlatform?.() === true)
}

// 未定义的探测路由返回 404 表示 API 已启动；502/503 表示上游仍不可用。
function probeNativeBridgeOnce() {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', `${NATIVE_APP_API_BASE}/__hm_ready`, true)
      xhr.timeout = NATIVE_BRIDGE_PROBE_SINGLE_TIMEOUT_MS
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) finish(xhr.status >= 200 && xhr.status < 500)
      }
      xhr.ontimeout = () => finish(false)
      xhr.onerror = () => finish(false)
      xhr.send()
    } catch (_) {
      finish(false)
    }
  })
}

async function waitForNativeBridge() {
  const deadline = Date.now() + NATIVE_BRIDGE_PROBE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await probeNativeBridgeOnce()) return { ready: true, native: true }
    await new Promise((resolve) => setTimeout(resolve, NATIVE_BRIDGE_PROBE_INTERVAL_MS))
  }
  return { ready: false, error: '内置音乐服务启动超时，请稍后重试' }
}

function ensureNcmApiReady() {
  if (ncmApiReadyPromise) return ncmApiReadyPromise

  // 原生 App：先等内嵌转发层就绪（原因见上方注释）
  if (isNativeAppRuntime()) {
    ncmApiReadyPromise = waitForNativeBridge()
      .then(state => {
        if (!state.ready) ncmApiReadyPromise = null
        return state
      })
    return ncmApiReadyPromise
  }

  if (typeof windowApi === 'undefined' || typeof windowApi.whenNcmApiReady !== 'function') {
    ncmApiReadyPromise = Promise.resolve({ ready: true, skipped: true })
    return ncmApiReadyPromise
  }

  ncmApiReadyPromise = waitWithTimeout(windowApi.whenNcmApiReady(), NCM_API_READY_TIMEOUT_MS)
    .then((payload) => {
      const readyState = payload && typeof payload === 'object' ? payload : { ready: true }
      if (!readyState.ready) {
        ncmApiReadyPromise = null
      }
      return readyState
    })
    .catch((error) => ({
      ready: false,
      error: error && error.message ? error.message : 'ncm-api-ready-failed',
    }))
    .then((readyState) => {
      if (!readyState || !readyState.ready) {
        ncmApiReadyPromise = null
      }
      return readyState
    })

  return ncmApiReadyPromise
}

function normalizeCookieString(cookieString) {
  return String(cookieString || '').trim()
}

function parseCookieString(cookieString) {
  const cookieMap = new Map()
  const cookieText = normalizeCookieString(cookieString)
  if (!cookieText) return cookieMap

  cookieText.split(';').forEach((segment) => {
    const cookiePart = String(segment || '').trim()
    if (!cookiePart) return

    const separatorIndex = cookiePart.indexOf('=')
    if (separatorIndex <= 0) return

    const name = cookiePart.slice(0, separatorIndex).trim()
    const value = cookiePart.slice(separatorIndex + 1).trim()
    if (!name || !value) return
    cookieMap.set(name, value)
  })

  return cookieMap
}

function mergeCookieStrings(...cookieStrings) {
  const mergedCookieMap = new Map()

  cookieStrings.forEach((cookieString) => {
    parseCookieString(cookieString).forEach((value, key) => {
      mergedCookieMap.set(key, value)
    })
  })

  if (mergedCookieMap.size == 0) return ''
  return Array.from(mergedCookieMap.entries()).map(([key, value]) => `${key}=${value}`).join('; ')
}

function buildAuthCookieString() {
  return AUTH_COOKIE_KEYS
    .map((key) => {
      const value = getCookie(key)
      return value ? `${key}=${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
}

function buildAbsoluteUrl(baseURL, requestUrl) {
  if (!requestUrl) return ''
  try {
    return new URL(requestUrl, baseURL || undefined).toString()
  } catch (_) {
    return String(requestUrl || '')
  }
}

function normalizeHeaders(headers) {
  try {
    if (axios.AxiosHeaders && typeof axios.AxiosHeaders.from === 'function') {
      return axios.AxiosHeaders.from(headers || {}).toJSON()
    }
  } catch (_) { }

  if (!headers || typeof headers !== 'object') return {}
  return { ...headers }
}

function isFormDataPayload(data) {
  return typeof FormData !== 'undefined' && data instanceof FormData
}

async function serializeRequestData(data) {
  if (!isFormDataPayload(data)) return data

  const entries = []
  for (const [name, value] of data.entries()) {
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      entries.push({
        name,
        kind: 'blob',
        value,
        filename: typeof value.name === 'string' && value.name ? value.name : undefined,
      })
      continue
    }

    entries.push({
      name,
      kind: 'text',
      value: String(value),
    })
  }

  return {
    __hmType: 'form-data',
    entries,
  }
}

export function invalidateNcmApiCookieCache() {
  // 保留导出，兼容现有调用点；主进程请求链不再依赖渲染层缓存的原始 NCM Cookie。
}

async function ncmIpcAdapter(config) {
  if (isFormDataPayload(config.data) && defaultAdapter) {
    return defaultAdapter(config)
  }

  if (typeof windowApi === 'undefined' || typeof windowApi.requestNcmApi !== 'function') {
    if (!defaultAdapter) {
      throw new Error('NCM request adapter unavailable')
    }
    return defaultAdapter(config)
  }

  try {
    const serializedData = await serializeRequestData(config.data)
    const response = await windowApi.requestNcmApi({
      url: buildAbsoluteUrl(config.baseURL, config.url),
      method: String(config.method || 'get').toLowerCase(),
      params: config.params || {},
      data: serializedData,
      headers: normalizeHeaders(config.headers),
      timeout: config.timeout,
      responseType: config.responseType,
    })

    const axiosResponse = {
      data: response?.data,
      status: Number(response?.status) || 500,
      statusText: response?.statusText || '',
      headers: response?.headers || {},
      config,
      request: null,
    }

    const validateStatus = config.validateStatus || (status => status >= 200 && status < 300)
    if (!validateStatus(axiosResponse.status)) {
      const errorCode = axiosResponse.status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST
      throw new axios.AxiosError(
        `Request failed with status code ${axiosResponse.status}`,
        errorCode,
        config,
        null,
        axiosResponse
      )
    }

    return axiosResponse
  } catch (error) {
    if (error instanceof axios.AxiosError) throw error
    throw new axios.AxiosError(
      error && error.message ? error.message : 'ncm-api-request-failed',
      axios.AxiosError.ERR_NETWORK,
      config,
      null,
      error && error.response ? error.response : null
    )
  }
}

request.defaults.adapter = ncmIpcAdapter

// 防抖：避免同一时间多次触发自动退出
let autoLoggingOut = false;
function triggerAutoLogout(reason) {
  if (autoLoggingOut) return;
  autoLoggingOut = true;

  void clearAccountScopedState({ clearSessionCookies: true }).finally(() => {
    // 轻微延迟后允许再次触发，避免请求风暴导致的重复提示
    setTimeout(() => { autoLoggingOut = false; }, 1500);
  })

  const userStore = useUserStore(pinia);
  userStore.appOptionShow = false;

  const message = reason || '登录状态已失效，已自动退出，请重新登录';
  noticeOpen(message, 3);
}

// 只有请求确实携带了 MUSIC_U 仍被判定未登录，才允许触发自动登出。
// 匿名态请求（未带登录 cookie）返回 301 属正常现象，不能据此清空全局登录态。
function shouldTriggerAutoLogout(config) {
  const requestCookie = parseCookieString(config?.params?.cookie).get('MUSIC_U')
  return Boolean(requestCookie && requestCookie === getCookie('MUSIC_U'))
}

// 请求拦截器
request.interceptors.request.use(async function (config) {
  const readyState = await ensureNcmApiReady()
  if (!readyState.ready) {
    throw new axios.AxiosError(readyState.error, 'ERR_NCM_NOT_READY', config)
  }
  config.params = config.params || {}
  config.headers = config.headers || {}

  if (config.url != '/login/qr/check') {
    const authCookieString = isLogin() ? buildAuthCookieString() : ''
    const mergedCookieString = mergeCookieStrings(authCookieString, config.params.cookie)
    if (mergedCookieString) config.params.cookie = mergedCookieString
  }
  if (libraryStore.needTimestamp.indexOf(config.url) != -1) {
    config.params.timestamp = new Date().getTime()
  }

  // 在发送请求之前做些什么
  return config;
}, function (error) {
  // 对请求错误做些什么
  noticeOpen("发起请求错误", 2)
  return Promise.reject(error);
});

function isAuthApi(url) {
  return url.startsWith('/login') || url.startsWith('/captcha/') || url === '/logout'
}

// 响应拦截器
request.interceptors.response.use(function (response) {
  const url = response?.config?.url || ''
  const data = response?.data

  // 跳过登录/登出相关接口的自动判断
  if (!isAuthApi(url) && data && typeof data === 'object') {
    const code = data.code
    const text = data.msg || data.message || ''
    // NCM 未登录常见返回：code=301 或者 message/msgs 提示需要登录
    if ((code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || ''))
      && shouldTriggerAutoLogout(response?.config)) {
      triggerAutoLogout('登录状态已失效，已自动退出');
    }
  }
  return data
}, function (error) {
  const url = error?.config?.url || ''
  const status = error?.response?.status
  const msg = error?.response?.data?.message || error?.response?.data?.msg
  const code = error?.response?.data?.code
  if (isNativeAppRuntime() && (error?.code === 'ERR_NETWORK' || status === 502 || status === 503)) {
    ncmApiReadyPromise = null
  }

  // 若后端以HTTP身份错误返回，直接触发自动登出
  if (!isAuthApi(url) && (status === 401 || status === 403) && shouldTriggerAutoLogout(error?.config)) {
    triggerAutoLogout('登录已过期，请重新登录');
  } else if (!isAuthApi(url)) {
    // 后端也可能以200以外的状态携带业务code
    const text = error?.response?.data?.msg || error?.response?.data?.message || ''
    if ((code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || ''))
      && shouldTriggerAutoLogout(error?.config)) {
      triggerAutoLogout('登录状态已失效，已自动退出');
    }
  }

  // 对 /like 与 /playlist/tracks 的错误不进行全局提示，这些操作由调用方负责降级与提示
  const suppressGlobalNotice = url === '/like'
    || url === '/playlist/tracks'
    || error?.config?.suppressGlobalNotice === true
  if (!suppressGlobalNotice) {
    if (error?.code === 'ERR_NCM_NOT_READY') noticeOpen(error.message, 3)
    else if (msg) noticeOpen(`请求错误：${msg}`, 2)
    else if (status) noticeOpen(`请求错误 (${status})`, 2)
    else noticeOpen('请求错误', 2)
  }
  return Promise.reject(error);
});

export default request;
