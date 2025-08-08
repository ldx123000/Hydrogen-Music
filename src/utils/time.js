/**
 * 原生时间处理工具 - 替代 dayjs
 * 提供常用的时间格式化和计算功能
 */

/**
 * 格式化时间
 * @param {Date|string|number} date - 时间对象、时间戳或时间字符串
 * @param {string} format - 格式化模板，支持 YYYY MM DD HH mm ss
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const d = new Date(date);
    
    if (isNaN(d.getTime())) {
        return '';
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 格式化持续时间（秒转换为 mm:ss 或 HH:mm:ss）
 * @param {number} duration - 持续时间（秒）
 * @param {boolean} showHours - 是否显示小时，默认自动判断
 * @returns {string} 格式化的持续时间
 */
export function formatDuration(duration, showHours = null) {
    if (!duration || duration < 0) {
        return '00:00';
    }

    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);

    const shouldShowHours = showHours !== null ? showHours : hours > 0;

    if (shouldShowHours) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

/**
 * 获取相对时间描述（如：1分钟前、2小时前）
 * @param {Date|string|number} date - 时间
 * @returns {string} 相对时间描述
 */
export function getRelativeTime(date) {
    const now = new Date();
    const target = new Date(date);
    
    if (isNaN(target.getTime())) {
        return '';
    }

    const diffMs = now.getTime() - target.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
        return '刚刚';
    } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
        return `${diffHours}小时前`;
    } else if (diffDays < 30) {
        return `${diffDays}天前`;
    } else if (diffMonths < 12) {
        return `${diffMonths}个月前`;
    } else {
        return `${diffYears}年前`;
    }
}

/**
 * 格式化播放次数
 * @param {number} count - 播放次数
 * @returns {string} 格式化的播放次数
 */
export function formatPlayCount(count) {
    if (!count || count < 0) {
        return '0';
    }

    if (count < 1000) {
        return count.toString();
    } else if (count < 10000) {
        return (count / 1000).toFixed(1) + 'k';
    } else if (count < 100000000) {
        return (count / 10000).toFixed(1) + '万';
    } else {
        return (count / 100000000).toFixed(1) + '亿';
    }
}

/**
 * 获取当前时间戳
 * @returns {number} 当前时间戳（毫秒）
 */
export function now() {
    return Date.now();
}

/**
 * 解析时间
 * @param {string|number} input - 时间输入
 * @returns {Date} Date 对象
 */
export function parseTime(input) {
    return new Date(input);
}

/**
 * 判断是否是今天
 * @param {Date|string|number} date - 时间
 * @returns {boolean} 是否是今天
 */
export function isToday(date) {
    const target = new Date(date);
    const today = new Date();
    
    return target.getFullYear() === today.getFullYear() &&
           target.getMonth() === today.getMonth() &&
           target.getDate() === today.getDate();
}

/**
 * 获取友好的时间显示
 * @param {Date|string|number} date - 时间
 * @returns {string} 友好的时间显示
 */
export function getFriendlyTime(date) {
    const target = new Date(date);
    
    if (isNaN(target.getTime())) {
        return '';
    }

    if (isToday(target)) {
        return formatTime(target, 'HH:mm');
    } else {
        const now = new Date();
        if (target.getFullYear() === now.getFullYear()) {
            return formatTime(target, 'MM-DD');
        } else {
            return formatTime(target, 'YYYY-MM-DD');
        }
    }
}