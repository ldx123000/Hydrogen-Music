import assert from 'node:assert/strict'
import { runWithConcurrency } from '../src/utils/runWithConcurrency.mjs'

let active = 0
let peak = 0
const completed = []

await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async item => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    completed.push(item)
    active -= 1
})

assert.equal(peak, 3)
assert.deepEqual(completed.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7])
