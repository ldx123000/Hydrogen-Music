/**
 * API 错误处理工具
 * 提供统一的错误处理和重试机制
 */

/**
 * API 错误类型常量
 */
export const ERROR_TYPES = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    CLIENT_ERROR: 'CLIENT_ERROR'
};

/**
 * 根据状态码判断错误类型
 * @param {number} status - HTTP状态码
 * @returns {string} 错误类型
 */
export function getErrorType(status) {
    if (!status) return ERROR_TYPES.NETWORK_ERROR;
    if (status >= 200 && status < 300) return null;
    if (status === 401 || status === 403) return ERROR_TYPES.AUTH_ERROR;
    if (status >= 400 && status < 500) return ERROR_TYPES.CLIENT_ERROR;
    if (status >= 500) return ERROR_TYPES.SERVER_ERROR;
    return ERROR_TYPES.NETWORK_ERROR;
}

/**
 * 获取错误信息
 * @param {string} errorType - 错误类型
 * @param {number} status - HTTP状态码
 * @returns {string} 错误信息
 */
export function getErrorMessage(errorType, status) {
    const errorMessages = {
        [ERROR_TYPES.NETWORK_ERROR]: '网络连接失败，请检查网络',
        [ERROR_TYPES.TIMEOUT_ERROR]: '请求超时，请重试',
        [ERROR_TYPES.AUTH_ERROR]: '身份验证失败，请重新登录',
        [ERROR_TYPES.SERVER_ERROR]: `服务器错误 (${status})`,
        [ERROR_TYPES.CLIENT_ERROR]: `请求错误 (${status})`
    };
    
    return errorMessages[errorType] || `未知错误 (${status})`;
}

/**
 * 检查是否应该重试
 * @param {string} errorType - 错误类型
 * @param {number} retryCount - 当前重试次数
 * @param {number} maxRetries - 最大重试次数
 * @returns {boolean} 是否应该重试
 */
export function shouldRetry(errorType, retryCount, maxRetries = 2) {
    if (retryCount >= maxRetries) return false;
    
    // 网络错误和服务器错误可以重试
    const retryableErrors = [ERROR_TYPES.NETWORK_ERROR, ERROR_TYPES.TIMEOUT_ERROR, ERROR_TYPES.SERVER_ERROR];
    return retryableErrors.includes(errorType);
}

/**
 * 带重试机制的 API 请求封装
 * @param {Function} apiCall - API调用函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} retryDelay - 重试延迟（毫秒）
 * @returns {Promise} API请求结果
 */
export function withRetry(apiCall, maxRetries = 2, retryDelay = 1000) {
    return new Promise(async (resolve, reject) => {
        let retryCount = 0;
        
        const makeRequest = async () => {
            try {
                const result = await apiCall();
                resolve(result);
            } catch (error) {
                const status = error.response?.status;
                const errorType = getErrorType(status);
                
                if (shouldRetry(errorType, retryCount, maxRetries)) {
                    retryCount++;
                    setTimeout(makeRequest, retryDelay * retryCount);
                } else {
                    const errorMessage = getErrorMessage(errorType, status);
                    reject(new Error(errorMessage));
                }
            }
        };
        
        makeRequest();
    });
}

/**
 * 创建错误处理装饰器
 * @param {object} options - 选项
 * @param {boolean} options.enableRetry - 是否启用重试
 * @param {number} options.maxRetries - 最大重试次数
 * @param {Function} options.onError - 错误回调
 * @returns {Function} 装饰器函数
 */
export function createErrorHandler(options = {}) {
    const { 
        enableRetry = false, 
        maxRetries = 2, 
        onError = null 
    } = options;
    
    return function(apiCall) {
        if (enableRetry) {
            return withRetry(apiCall, maxRetries);
        } else {
            return apiCall().catch(error => {
                const status = error.response?.status;
                const errorType = getErrorType(status);
                const errorMessage = getErrorMessage(errorType, status);
                
                if (onError) {
                    onError(errorMessage, errorType, status);
                }
                
                throw new Error(errorMessage);
            });
        }
    };
}