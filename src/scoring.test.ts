import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accuracy, isCorrectLine, roundScore, timeMultiplier, ROUND_SECONDS } from './scoring.ts'
import { parseDiff } from './diff.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

test('множитель времени не падает ниже 0.2', () => {
  assert.equal(timeMultiplier(0), 0.2)
  assert.equal(timeMultiplier(ROUND_SECONDS), 1)
})

test('второй клик стоит дешевле первого, промах — ноль', () => {
  assert.equal(accuracy(1, true), 1)
  assert.equal(accuracy(2, true), 0.6)
  assert.equal(accuracy(1, false), 0)
})

test('за нулевую точность очков нет независимо от времени', () => {
  assert.equal(roundScore(5, ROUND_SECONDS, 0), 0)
})

// Главное, ради чего эти тесты и написаны: разметка пака должна совпадать
// с тем, что игрок реально видит на экране.
for (const task of PACK) {
  test(`${task.id}: размеченные строки существуют в дифе`, () => {
    const newNos = new Set(
      parseDiff(task.diff)
        .filter((l) => l.newNo !== null)
        .map((l) => l.newNo!),
    )
    for (const bug of task.bugs) assert.ok(newNos.has(bug.line), `нет строки ${bug.line}`)
    for (const d of task.decoys) assert.ok(newNos.has(d.line), `нет строки обманки ${d.line}`)
  })

  test(`${task.id}: подлянка засчитывается, обманка — нет`, () => {
    for (const bug of task.bugs) assert.ok(isCorrectLine(task, bug.line))
    for (const d of task.decoys) assert.ok(!isCorrectLine(task, d.line), `обманка ${d.line} засчиталась`)
  })

  if (task.clean) {
    test(`${task.id}: чистый раунд не принимает ни одну строку`, () => {
      const newNos = parseDiff(task.diff)
        .filter((l) => l.newNo !== null)
        .map((l) => l.newNo!)
      for (const n of newNos) assert.ok(!isCorrectLine(task, n))
    })
  }
}

test('подлянка типа missing принимается с допуском ±1, но не ±2', () => {
  const task = PACK.find((t) => t.bugs.some((b) => b.kind === 'missing'))!
  const line = task.bugs.find((b) => b.kind === 'missing')!.line
  assert.ok(isCorrectLine(task, line - 1))
  assert.ok(isCorrectLine(task, line + 1))
  assert.ok(!isCorrectLine(task, line + 2))
})

test('подлянка типа wrong требует точного попадания', () => {
  const task = PACK.find((t) => t.bugs.some((b) => b.kind === 'wrong'))!
  const line = task.bugs.find((b) => b.kind === 'wrong')!.line
  assert.ok(isCorrectLine(task, line))
  assert.ok(!isCorrectLine(task, line + 1))
})
