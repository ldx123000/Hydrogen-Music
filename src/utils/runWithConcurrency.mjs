export async function runWithConcurrency(items, concurrency, worker) {
    let nextIndex = 0
    const workerCount = Math.min(Math.max(1, concurrency), items.length)

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const item = items[nextIndex]
            nextIndex += 1
            await worker(item)
        }
    }))
}
