import { Howl } from 'howler'

// Howler 2.x 用 setTimeout 派发事件，Android WebView 后台会延迟这些计时器。
// 保持回调异步，但使用微任务，让原生 ended 处理完停止状态后即可重播/切歌。
export class BackgroundHowl extends Howl {
    _emit(event, id, message) {
        const listeners = this['_on' + event]
        if (!Array.isArray(listeners)) return super._emit(event, id, message)

        for (const listener of [...listeners].reverse()) {
            if (listener.id && listener.id !== id && event !== 'load') continue

            queueMicrotask(() => listener.fn.call(this, id, message))
            if (listener.once) this.off(event, listener.fn, listener.id)
        }

        this._loadQueue(event)
        return this
    }
}
