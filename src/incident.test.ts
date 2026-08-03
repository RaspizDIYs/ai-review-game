/**
 * Спецификация инцидента. Написана до реализации — тесты красные, пока
 * `incident.ts` состоит из заглушек.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Defect } from './defects.ts'
import { logFor, suspects, type IncidentLog } from './incident.ts'
import type { ShiftEvent } from './shift.ts'

function defect(over: Partial<Defect> = {}): Defect {
  return {
    task: 'js-cache-invalidation-001',
    pr: 1408,
    merged: 0,
    tag: 'cache-no-invalidation',
    weight: 3,
    fuse: 0,
    leak: 0.6,
    known: true,
    ...over,
  }
}

const LOGS: IncidentLog[] = [
  { tag: 'cache-no-invalidation', lines: 'WARN cache hit ratio 0.98 (was 0.42)' },
  { tag: 'cache-no-invalidation', lines: 'ERROR stale profile served to 412 users' },
  { tag: 'error-swallowed', lines: 'ERROR queue depth 12401, no consumers' },
]

function mergedEvent(pr: number, turn: number, task = `task-${pr}`): ShiftEvent {
  return { kind: 'merged', turn, pr, task, outcome: 'missed' }
}

test('лог берётся по тегу подлянки, а не по задаче', () => {
  const found = logFor(defect({ task: 'py-cache-other-001' }), LOGS)

  assert.ok(found)
  assert.equal(found.tag, 'cache-no-invalidation')
})

test('на один тег может быть несколько логов, выбор детерминирован', () => {
  const d = defect()

  assert.deepEqual(logFor(d, LOGS), logFor(d, LOGS))
  // Разные пропуски одной и той же подлянки не обязаны читаться одинаково,
  // но каждый сам по себе стабилен.
  assert.ok(logFor(d, LOGS))
  assert.ok(logFor(defect({ pr: 1409 }), LOGS))
})

test('нет лога на этот тег — null, а не выдуманный текст', () => {
  assert.equal(logFor(defect({ tag: 'нет-такого-тега' }), LOGS), null)
  assert.equal(logFor(defect(), []), null)
})

test('среди подозреваемых ровно один виновный', () => {
  const log = [mergedEvent(1408, 0), mergedEvent(1409, 1), mergedEvent(1410, 2)]
  const list = suspects(defect({ pr: 1408 }), log, 3)

  assert.equal(list.filter((s) => s.right).length, 1)
  assert.equal(list.find((s) => s.right)?.pr, 1408)
})

test('подозреваемые не повторяются и не превышают запрошенное число', () => {
  const log = Array.from({ length: 8 }, (_, i) => mergedEvent(1408 + i, i))
  const list = suspects(defect({ pr: 1408 }), log, 4)

  assert.equal(list.length, 4)
  assert.equal(new Set(list.map((s) => s.pr)).size, 4)
})

test('заблокированные PR в подозреваемые не идут', () => {
  const log: ShiftEvent[] = [
    mergedEvent(1408, 0),
    { kind: 'blocked', turn: 1, pr: 1409, task: 'x', outcome: 'found' },
    { kind: 'cleanup', turn: 2, task: null },
  ]

  const list = suspects(defect({ pr: 1408 }), log, 4)

  assert.deepEqual(
    list.map((s) => s.pr),
    [1408],
  )
})

test('мёрджей меньше, чем просили — отдаём сколько есть', () => {
  const list = suspects(defect({ pr: 1408 }), [mergedEvent(1408, 0)], 4)

  assert.equal(list.length, 1)
  assert.equal(list[0].right, true)
})

test('порядок стабилен между перерисовками', () => {
  const log = Array.from({ length: 6 }, (_, i) => mergedEvent(1408 + i, i))
  const d = defect({ pr: 1410 })

  assert.deepEqual(suspects(d, log, 4), suspects(d, log, 4))
})

test('виновный не всегда стоит на одном и том же месте', () => {
  // Иначе после третьего инцидента игрок перестаёт читать лог и жмёт первый
  // вариант. Проверяем на нескольких дефектах: позиция обязана гулять.
  const log = Array.from({ length: 6 }, (_, i) => mergedEvent(1408 + i, i))
  const positions = new Set(
    [1408, 1409, 1410, 1411, 1412, 1413].map((pr) =>
      suspects(defect({ pr, task: `t-${pr}` }), log, 4).findIndex((s) => s.right),
    ),
  )

  assert.ok(positions.size > 1, `виновный всегда на позиции ${[...positions]}`)
})
