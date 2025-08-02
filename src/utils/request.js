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
    noticeOpen("请求错误", 2)
    return error;
});

export default request;