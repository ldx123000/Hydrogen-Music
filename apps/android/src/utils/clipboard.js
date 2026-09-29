/**
 * 文字复制工具
 * 提供评论文字复制功能
 */

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyToClipboard(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  try {
    // 优先使用现代的 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // 降级到传统的 document.execCommand 方法
      return copyTextFallback(text);
    }
  } catch (error) {
    console.warn('复制到剪贴板失败:', error);
    // 尝试降级方案
    return copyTextFallback(text);
  }
}

/**
 * 降级的文本复制方法
 * @param {string} text - 要复制的文本
 * @returns {boolean} 是否复制成功
 */
function copyTextFallback(text) {
  try {
    // 创建一个临时的 textarea 元素
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // 设置样式，使其不可见
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    
    // 添加到 DOM
    document.body.appendChild(textArea);
    
    // 选中文本
    textArea.focus();
    textArea.select();
    
    // 执行复制命令
    const successful = document.execCommand('copy');
    
    // 清理 DOM
    document.body.removeChild(textArea);
    
    return successful;
  } catch (error) {
    console.warn('降级复制方法失败:', error);
    return false;
  }
}

/**
 * 复制选中的文本
 * @returns {string|null} 返回选中的文本，如果没有选中则返回null
 */
export function getSelectedText() {
  try {
    const selection = window.getSelection();
    return selection.toString().trim() || null;
  } catch (error) {
    console.warn('获取选中文本失败:', error);
    return null;
  }
}

/**
 * 检查是否支持剪贴板操作
 * @returns {boolean} 是否支持
 */
export function isClipboardSupported() {
  return !!(navigator.clipboard || document.execCommand);
}

/**
 * 复制评论文本（移除表情符号，保留原始文字）
 * @param {string} text - 评论文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyCommentText(text) {
  if (!text) return false;
  
  // 移除表情符号，只保留原始的[表情]文字
  let cleanText = text;
  
  // 这里可以选择是否保留表情文字还是移除
  // 保留表情文字的版本：
  // cleanText 保持不变
  
  // 如果要移除表情文字，可以使用：
  // cleanText = text.replace(/\[([^\[\]]+)\]/g, '');
  
  return await copyToClipboard(cleanText);
}

/**
 * 创建复制按钮的点击处理器
 * @param {string} text - 要复制的文本
 * @param {Function} onSuccess - 复制成功的回调
 * @param {Function} onError - 复制失败的回调
 * @returns {Function} 点击处理函数
 */
export function createCopyHandler(text, onSuccess = null, onError = null) {
  return async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const success = await copyCommentText(text);
    
    if (success) {
      if (onSuccess) {
        onSuccess(text);
      }
    } else {
      if (onError) {
        onError(new Error('复制失败'));
      }
    }
  };
}

/**
 * 为元素添加双击复制功能
 * @param {HTMLElement} element - 目标元素
 * @param {string} text - 要复制的文本
 * @param {Function} onSuccess - 成功回调
 * @param {Function} onError - 失败回调
 */
export function addDoubleClickCopy(element, text, onSuccess = null, onError = null) {
  if (!element || !text) return;
  
  const handler = createCopyHandler(text, onSuccess, onError);
  element.addEventListener('dblclick', handler);
  
  // 返回清理函数
  return () => {
    element.removeEventListener('dblclick', handler);
  };
}

/**
 * 选中元素中的所有文本
 * @param {HTMLElement} element - 要选中文本的元素
 */
export function selectElementText(element) {
  if (!element) return;
  
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (error) {
    console.warn('选中文本失败:', error);
  }
}