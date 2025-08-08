/**
 * API 参数构建工具
 * 提供常用参数的标准化构建方法
 */

/**
 * 构建分页参数
 * @param {number} page - 页码，从1开始
 * @param {number} limit - 每页数量，默认30
 * @returns {object} 包含limit和offset的参数对象
 */
export function buildPaginationParams(page = 1, limit = 30) {
    return {
        limit,
        offset: (page - 1) * limit
    };
}

/**
 * 构建时间戳参数
 * @returns {object} 包含timestamp的参数对象
 */
export function buildTimestampParams() {
    return {
        timestamp: new Date().getTime()
    };
}

/**
 * 构建ID参数
 * @param {string|number} id - ID值
 * @param {object} extraParams - 额外参数
 * @returns {object} 包含id和额外参数的对象
 */
export function buildIdParams(id, extraParams = {}) {
    return {
        id,
        ...extraParams
    };
}

/**
 * 构建带时间戳的ID参数
 * @param {string|number} id - ID值
 * @param {object} extraParams - 额外参数
 * @returns {object} 包含id、timestamp和额外参数的对象
 */
export function buildIdWithTimestamp(id, extraParams = {}) {
    return {
        id,
        timestamp: new Date().getTime(),
        ...extraParams
    };
}

/**
 * 构建操作参数（用于收藏、取消收藏等）
 * @param {string|number} id - 目标ID
 * @param {boolean} isAdd - true为添加操作，false为取消操作
 * @param {object} extraParams - 额外参数
 * @returns {object} 包含操作参数的对象
 */
export function buildOperationParams(id, isAdd = true, extraParams = {}) {
    return {
        id,
        t: isAdd ? 1 : 0,
        ...extraParams
    };
}

/**
 * 构建类型筛选参数
 * @param {string|number} type - 类型值
 * @param {object} extraParams - 额外参数
 * @returns {object} 包含type和额外参数的对象
 */
export function buildTypeParams(type, extraParams = {}) {
    return {
        type,
        ...extraParams
    };
}

/**
 * 构建区域参数（用于专辑、歌曲等区域筛选）
 * @param {string} area - 区域代码 ALL:全部,ZH:华语,EA:欧美,KR:韩国,JP:日本
 * @param {object} extraParams - 额外参数
 * @returns {object} 包含area和额外参数的对象
 */
export function buildAreaParams(area = 'ALL', extraParams = {}) {
    return {
        area,
        ...extraParams
    };
}

/**
 * 合并多个参数构建器的结果
 * @param {...object} paramBuilders - 参数构建器的结果
 * @returns {object} 合并后的参数对象
 */
export function mergeParams(...paramBuilders) {
    return Object.assign({}, ...paramBuilders);
}