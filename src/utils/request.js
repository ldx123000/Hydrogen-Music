import axios from "axios";
import { getCookie, isLogin, clearLoginCookies } from '../utils/authority'
import pinia from "../store/pinia";
import { useLibraryStore } from '../store/libraryStore'
import { useUserStore } from '../store/userStore'

const libraryStore = useLibraryStore(pinia)

import { noticeOpen } from "./dialog";

// 检查是否有增强版API可用（新包名）
let enhancedApi = null;
try {
    enhancedApi = require('@neteasecloudmusicapienhanced/api');
} catch (e) {
    console.log('@neteasecloudmusicapienhanced/api 未找到，使用传统请求方式');
}

const request = axios.create({
    baseURL: 'http://localhost:36530', // 保持向后兼容，但会优先使用增强版API
    withCredentials: true,
    timeout: 10000,
});

// 防抖：避免同一时间多次触发自动退出
let autoLoggingOut = false;
function triggerAutoLogout(reason) {
  if (autoLoggingOut) return;
  autoLoggingOut = true;

  try {
    // 清理登录态
    clearLoginCookies();

    const userStore = useUserStore(pinia);
    userStore.user = null;
    userStore.likelist = null;

    // 清理嵌入式会话（若存在）
    try { window.electronAPI?.clearLoginSession?.(); } catch (_) {}

    // 友好提示
    const message = reason || '登录状态已失效，已自动退出，请重新登录';
    noticeOpen(message, 3);

    // 不自动跳转，让用户自行在界面中重新登录
  } finally {
    // 轻微延迟后允许再次触发，避免请求风暴导致的重复提示
    setTimeout(() => { autoLoggingOut = false; }, 1500);
  }
}

// 请求拦截器
request.interceptors.request.use(function (config) {
  if (enhancedApi && config.useEnhancedApi) {
    return config;
  }
  
  if(config.url != '/login/qr/check' && isLogin())
    config.params.cookie = `MUSIC_U=${getCookie('MUSIC_U')};`;
  if(libraryStore.needTimestamp.indexOf(config.url) != -1) {
    config.params.timestamp = new Date().getTime()
  }
  
  // 添加国内IP伪装来解决524环境异常错误
  config.headers['X-Real-IP'] = '211.161.244.70'; // 国内IP地址
  config.headers['X-Forwarded-For'] = '211.161.244.70';
  
  // 在发送请求之前做些什么
  return config;
}, function (error) {
  // 对请求错误做些什么
  noticeOpen("发起请求错误", 2)
  return Promise.reject(error);
});

// 响应拦截器
request.interceptors.response.use(function (response) {
    const url = response?.config?.url || ''
    const data = response?.data

    // 跳过登录/登出相关接口的自动判断
    const isAuthApi = url.startsWith('/login') || url === '/logout'
    if (!isAuthApi && data && typeof data === 'object') {
      const code = data.code
      const text = data.msg || data.message || ''
      // NCM 未登录常见返回：code=301 或者 message/msgs 提示需要登录
      if (code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || '')) {
        triggerAutoLogout('登录状态已失效，已自动退出');
      }
    }
    return data
  }, function (error) {
    const url = error?.config?.url || ''
    const status = error?.response?.status
    const msg = error?.response?.data?.message || error?.response?.data?.msg

    // 若后端以HTTP身份错误返回，直接触发自动登出
    if (status === 401 || status === 403) {
      triggerAutoLogout('登录已过期，请重新登录');
    } else {
      // 后端也可能以200以外的状态携带业务code
      const code = error?.response?.data?.code
      const text = error?.response?.data?.msg || error?.response?.data?.message || ''
      if (code === 301 || /需要登录|请先登录|not\s*login|invalid\s*session/i.test(text || '')) {
        triggerAutoLogout('登录状态已失效，已自动退出');
      }
    }

    // 对 /like 与 /playlist/tracks 的错误不进行全局提示，这些操作由调用方负责降级与提示
    const suppressGlobalNotice = url === '/like' || url === '/playlist/tracks'
    if (!suppressGlobalNotice) {
      if (msg) noticeOpen(`请求错误：${msg}`, 2)
      else if (status) noticeOpen(`请求错误 (${status})`, 2)
      else noticeOpen('请求错误', 2)
    }
    return error;
  });

export default request;

// 导出API实例以供其他模块使用
export { enhancedApi };
