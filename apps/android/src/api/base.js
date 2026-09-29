import request from "../utils/request";

/**
 * API 基础工具类
 * 提供通用的 API 请求方法，减少重复代码
 */

/**
 * GET 请求的通用封装
 * @param {string} url - 请求路径
 * @param {object} params - 请求参数
 * @param {boolean} autoTimestamp - 是否自动添加时间戳
 * @returns {Promise} 请求结果
 */
export function get(url, params = {}, autoTimestamp = false) {
    if (autoTimestamp) {
        params.timestamp = new Date().getTime();
    }
    return request({
        url,
        method: 'get',
        params,
    });
}

/**
 * POST 请求的通用封装
 * @param {string} url - 请求路径
 * @param {object} data - 请求体数据
 * @param {object} params - URL参数
 * @returns {Promise} 请求结果
 */
export function post(url, data = {}, params = {}) {
    return request({
        url,
        method: 'post',
        data,
        params,
    });
}

/**
 * 创建带ID的GET请求
 * @param {string} url - 请求路径
 * @param {string|number} id - ID参数
 * @param {object} extraParams - 额外参数
 * @param {boolean} autoTimestamp - 是否自动添加时间戳
 * @returns {Promise} 请求结果
 */
export function getById(url, id, extraParams = {}, autoTimestamp = true) {
    return get(url, { id, ...extraParams }, autoTimestamp);
}

/**
 * 创建分页请求
 * @param {string} url - 请求路径
 * @param {object} options - 分页选项
 * @param {number} options.limit - 每页数量，默认30
 * @param {number} options.offset - 偏移量，默认0
 * @param {object} options.extraParams - 额外参数
 * @returns {Promise} 请求结果
 */
export function getWithPagination(url, { limit = 30, offset = 0, ...extraParams } = {}) {
    return get(url, { limit, offset, ...extraParams });
}

/**
 * 创建操作类请求（如收藏、取消收藏）
 * @param {string} url - 请求路径
 * @param {string|number} id - 目标ID
 * @param {number} t - 操作类型（1为执行操作，其他为取消）
 * @param {object} extraParams - 额外参数
 * @returns {Promise} 请求结果
 */
export function operationRequest(url, id, t, extraParams = {}) {
    return get(url, { id, t, ...extraParams });
}

/**
 * 创建类型筛选请求
 * @param {string} url - 请求路径
 * @param {string|number} type - 类型参数
 * @param {object} extraParams - 额外参数
 * @returns {Promise} 请求结果
 */
export function getByType(url, type, extraParams = {}) {
    return get(url, { type, ...extraParams });
}