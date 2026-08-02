import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ENDLESS_LIVES,
  isRunOver,
  MAX_ATTEMPTS,
  resolveClaimClean,
  resolveLineClick,
  resolveTimeout,
} from './round.ts'
import type { Task } from './types.ts'

const POOL: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

const DIRTY = POOL.find((t) => !t.clean)!
const CLEAN = POOL.find((t) => t.clean)!
const BUG = DIRTY.bugs[0].line
const DECOY = DIRTY.decoys[0].line

test('попадание в подлянку с первого клика — раунд закончен, попытка первая', () => {
  const r = resolveLineClick(DIRTY, BUG, [])
  assert.deepEqual(r, { kind: 'finish', outcome: 'found', attempt: 1, line: BUG })
})

test('попадание со второго клика засчитывается, но это вторая попытка', () => {
  const r = resolveLineClick(DIRTY, BUG, [DECOY])
  assert.equal(r.kind, 'finish')
  assert.deepEqual(r, { kind: 'finish', outcome: 'found', attempt: 2, line: BUG })
})

test('первый промах не заканчивает раунд и запоминается', () => {
  const r = resolveLineClick(DIRTY, DECOY, [])
  assert.deepEqual(r, { kind: 'continue', wrongPicks: [DECOY] })
})

test('второй промах — уехало в прод', () => {
  const r = resolveLineClick(DIRTY, DECOY, [DECOY + 1])
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'missed')
})

test('на чистом раунде первый же клик по строке — обвинение, без второй попытки', () => {
  const line = CLEAN.decoys[0].line
  const r = resolveLineClick(CLEAN, line, [])
  assert.deepEqual(r, { kind: 'finish', outcome: 'false-accusation', attempt: 1, line })
})

test('«здесь чисто» на чистом раунде засчитывается', () => {
  const r = resolveClaimClean(CLEAN, [])
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'clean-correct')
})

test('«здесь чисто» при живой подлянке — пропуск', () => {
  const r = resolveClaimClean(DIRTY, [])
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'missed')
})

test('истёкший таймер — пропуск без выбранной строки', () => {
  assert.deepEqual(resolveTimeout(), {
    kind: 'finish',
    outcome: 'missed',
    attempt: MAX_ATTEMPTS + 1,
    line: null,
  })
})

test('дневная серия кончается на последнем раунде, а не по пропускам', () => {
  assert.equal(isRunOver('daily', 0, 4, 3), false)
  assert.equal(isRunOver('daily', 3, 4, 0), true)
})

test('бесконечный кончается на третьем пропуске, а не по номеру раунда', () => {
  assert.equal(isRunOver('endless', 99, 4, ENDLESS_LIVES - 1), false)
  assert.equal(isRunOver('endless', 0, 4, ENDLESS_LIVES), true)
})
