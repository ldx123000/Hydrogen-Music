import request from "../utils/request";
import { normalizePlaylistSong } from "./playlist";

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeCloudPagination(params = {}) {
  const pagesize = Number(params?.pagesize || params?.limit || 30);
  const safePageSize = Number.isFinite(pagesize) && pagesize > 0 ? pagesize : 30;
  const page = Number(
    params?.page || (params?.offset != null ? Math.floor(Number(params.offset) / safePageSize) + 1 : 1)
  );

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pagesize: safePageSize,
  };
}

function normalizeCloudSong(item = {}) {
  const baseSong = normalizePlaylistSong(item?.simpleSong || item?.simple_song || item?.song || item?.music || item);
  const fileName = item?.fileName || item?.file_name || item?.filename || item?.name || baseSong?.name || "未知文件";
  const songName = item?.songName || item?.song_name || item?.name || baseSong?.name || "未知歌曲";
  const fileSize = Number(item?.fileSize || item?.file_size || item?.size || item?.filesize || 0) || 0;
  const addTime = item?.addTime || item?.add_time || item?.time || item?.createTime || Date.now();
  const cloudHash = String(
    item?.hash ||
      item?.FileHash ||
      item?.file_hash ||
      baseSong?.hash ||
      ""
  ).trim();
  const cloudAlbumAudioId = item?.album_audio_id || item?.albumAudioId || item?.audio_id || baseSong?.album_audio_id || baseSong?.id || "";
  const normalizedId = baseSong?.id || cloudAlbumAudioId || cloudHash || item?.id || fileName;

  return {
    ...item,
    id: item?.id || normalizedId,
    songName,
    fileName,
    fileSize,
    addTime,
    hash: cloudHash,
    album_audio_id: cloudAlbumAudioId,
    simpleSong: {
      ...baseSong,
      id: normalizedId,
      hash: cloudHash || baseSong?.hash || "",
      album_audio_id: cloudAlbumAudioId || baseSong?.album_audio_id || "",
      name: baseSong?.name || songName,
      cloudUrlParams: {
        hash: cloudHash || undefined,
        album_id: item?.album_id || baseSong?.al?.id || baseSong?.album?.id || undefined,
        album_audio_id: cloudAlbumAudioId || undefined,
        name: songName,
      },
      source: "cloud",
      type: "cloud",
    },
  };
}

/**
 * 获取用户云盘数据。
 * 酷狗接口使用 page/pagesize 分页，这里兼容旧调用方的 limit/offset 参数。
 */
export function getCloudDiskData(params = {}) {
  const requestParams = {
    ...params,
    ...normalizeCloudPagination(params),
  };

  return request({
    url: "/user/cloud",
    method: "get",
    params: requestParams,
  }).then((result) => {
    const payload = result?.data || result || {};
    const list = toArray(payload?.list || payload?.songs || payload?.data || payload).map((item) => normalizeCloudSong(item));

    return {
      ...result,
      count: Number(payload?.total || payload?.count || list.length) || 0,
      size: Number(payload?.used_size || payload?.size || 0) || 0,
      maxSize: Number(payload?.max_size || payload?.maxSize || 0) || 0,
      data: list,
    };
  });
}

/**
 * 获取云盘歌曲播放地址。
 * 酷狗云盘歌曲优先走专用接口，避免直接走普通 /song/url 时拿不到地址。
 */
export function getCloudDiskSongUrl(params) {
  return request({
    url: "/user/cloud/url",
    method: "get",
    params,
  });
}

/**
 * 酷狗文档中未提供云盘详情接口，保留占位避免旧调用直接报错。
 */
export function getCloudDiskDrtail(_params) {
  return Promise.resolve({
    code: 501,
    message: "KuGou API 暂未提供云盘详情接口",
  });
}

/**
 * 酷狗文档中未提供云盘删除接口，前端显式提示未支持。
 */
export function deleteCloudSong(_params) {
  return Promise.resolve({
    code: 501,
    message: "KuGou API 暂未提供云盘删除接口",
  });
}

/**
 * 酷狗文档中未提供云盘上传接口，前端显式提示未支持。
 */
export function uploadCloudSong(_formData) {
  return Promise.resolve({
    code: 501,
    message: "KuGou API 暂未提供云盘上传接口",
  });
}
