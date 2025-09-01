import { useOtherStore } from '../store/otherStore';
import { storeToRefs } from 'pinia';

// 延迟初始化，避免在 Pinia 未激活时调用 useOtherStore() 导致白屏
let storeRefs = null;
function ensureStoreRefs() {
    if (!storeRefs) {
        const otherStore = useOtherStore();
        storeRefs = storeToRefs(otherStore);
    }
    return storeRefs;
}

let currentCallback = null

export function dialogOpen(header, text, callback) {
    const { dialogShow } = ensureStoreRefs();
    dialogShow.value = true
    currentCallback = callback
    dialogSetter(header, text)
}
export function dialogClose() {
    const { dialogShow } = ensureStoreRefs();
    dialogShow.value = false
}
export function dialogSetter(header, text) {
    const { dialogHeader, dialogText } = ensureStoreRefs();
    dialogHeader.value = header
    dialogText.value = text
}
export function dialogClear() {
    const { dialogHeader, dialogText } = ensureStoreRefs();
    dialogHeader.value = null
    dialogText.value = null
}
export function dialogCancel() {
    currentCallback(false)
    dialogClose()
}
export function dialogConfirm() {
    currentCallback(true)
    dialogClose()
}

let noticeTimer1 = null
let noticeTimer2 = null
export function noticeOpen(text, duration) {
    const { noticeShow, noticeText, niticeOutAnimation } = ensureStoreRefs();
    noticeShow.value = false
    niticeOutAnimation.value = false
    clearTimeout(noticeTimer1)
    clearTimeout(noticeTimer2)
    noticeShow.value = true
    noticeText.value = text
    
    noticeTimer1 = setTimeout(() => {
        niticeOutAnimation.value = true
        clearTimeout(noticeTimer1)
        noticeTimer2 = setTimeout(() => {
            noticeShow.value = false
            niticeOutAnimation.value = false
            clearTimeout(noticeTimer2)
        }, 300);
    }, duration * 1000);
}
