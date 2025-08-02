import { useOtherStore } from '../store/otherStore';
import { storeToRefs } from 'pinia';
const otherStore =  useOtherStore()
const { dialogShow, dialogHeader, dialogText, noticeShow, noticeText, niticeOutAnimation } = storeToRefs(otherStore)

let currentCallback = null

export function dialogOpen(header, text, callback) {
    dialogShow.value = true
    currentCallback = callback
    dialogSetter(header, text)
}
export function dialogClose() {
    dialogShow.value = false
}
export function dialogSetter(header, text) {
    dialogHeader.value = header
    dialogText.value = text
}
export function dialogClear() {
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