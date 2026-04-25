export function runIdleTask(task, options = {}) {
    const { immediate = false, timeout = 1500, fallbackDelay = 250 } = options

    return new Promise((resolve, reject) => {
        const runTask = () => {
            Promise.resolve().then(task).then(resolve, reject)
        }

        if (immediate || typeof window === 'undefined') {
            runTask()
            return
        }

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runTask, { timeout })
            return
        }

        window.setTimeout(runTask, fallbackDelay)
    })
}
