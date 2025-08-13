import axios from "axios";
import { getCookie, isLogin } from '../utils/authority'
import pinia from "../store/pinia";
import { useLibraryStore } from '../store/libraryStore'

const libraryStore = useLibraryStore(pinia)

import { noticeOpen } from "./dialog";
const request = axios.create({
    baseURL: 'http://localhost:36530',
    withCredentials: true,
    timeout: 10000,
});

// 请求拦截器
request.interceptors.request.use(function (config) {
  if(config.url != '/login/qr/check' && isLogin())
    config.params.cookie = `MUSIC_U=${getCookie('MUSIC_U')};`;
  if(libraryStore.needTimestamp.indexOf(config.url) != -1) {
    config.params.timestamp = new Date().getTime()
  }
    // 在发送请求之前做些什么
    return config;
  }, function (error) {
    // 对请求错误做些什么
    noticeOpen("发起请求错误", 2)
    return Promise.reject(error);
});

// 响应拦截器
request.interceptors.response.use(function (response) {
    return response.data
  }, function (error) {
    const url = error?.config?.url || ''
    const status = error?.response?.status
    const msg = error?.response?.data?.message || error?.response?.data?.msg
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