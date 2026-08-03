import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isClickable, parseDiff } from './diff.ts'
import { ENDLESS_LIVES, isRunOver, MAX_ATTEMPTS, resolveSubmit, resolveTimeout } from './round.ts'
import type { Task } from './types.ts'

const POOL: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

const DIRTY = POOL.find((t) => !t.clean && t.bugs.length === 1)!
const CLEAN = POOL.find((t) => t.clean)!
const BUG = DIRTY.bugs[0].line
const DECOY = DIRTY.decoys[0].line

test('одна отмеченная строка и она же подлянка — раунд взят с первой попытки', () => {
  const r = resolveSubmit(DIRTY, [BUG], 0)
  assert.deepEqual(r, {
    kind: 'finish',
    outcome: 'found',
    attempt: 1,
    picks: [BUG],
    coverage: { found: 1, total: 1, extras: 0 },
  })
})

test('подлянка вместе с лишней строкой — это не «нашёл», а частично', () => {
  const r = resolveSubmit(DIRTY, [BUG, DECOY], 0)
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') {
    assert.equal(r.outcome, 'partial')
    assert.deepEqual(r.coverage, { found: 1, total: 1, extras: 1 })
  }
})

test('обвинил больше невиновных строк, чем нашёл виноватых, — это обвинение', () => {
  // Дробовик: отметить весь диф и задеть подлянку. Раньше это считалось
  // частичной находкой и приносило четверть очков без потери жизни.
  const all = parseDiff(DIRTY.diff).filter(isClickable).map((l) => l.newNo!)
  const r = resolveSubmit(DIRTY, all, 0)

  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') {
    assert.equal(r.outcome, 'false-accusation')
    assert.ok(r.coverage && r.coverage.extras > r.coverage.found)
  }
})

test('одна лишняя строка на одну найденную — ещё частично, а не обвинение', () => {
  // Граница: пока попаданий не меньше промахов, это честная неточность.
  const r = resolveSubmit(DIRTY, [BUG, DECOY], 0)
  if (r.kind === 'finish') assert.equal(r.outcome, 'partial')
})

test('мимо всех подлянок — попытка сгорает, раунд продолжается', () => {
  const r = resolveSubmit(DIRTY, [DECOY], 0)
  assert.deepEqual(r, { kind: 'retry', wrongPicks: [DECOY], attempts: 1 })
})

test('второй промах — уехало в прод', () => {
  const r = resolveSubmit(DIRTY, [DECOY], 1)
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'missed')
})

test('отмеченные строки приходят в вердикт отсортированными', () => {
  const r = resolveSubmit(DIRTY, [DECOY, BUG], 0)
  if (r.kind === 'finish') {
    assert.deepEqual(r.picks, [DECOY, BUG].sort((a, b) => a - b))
  }
})

test('пустая отправка на чистом раунде — апрув', () => {
  const r = resolveSubmit(CLEAN, [], 0)
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'clean-correct')
})

test('пустая отправка при живой подлянке — пропуск', () => {
  const r = resolveSubmit(DIRTY, [], 0)
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') assert.equal(r.outcome, 'missed')
})

test('на чистом раунде любая отмеченная строка — обвинение, без второй попытки', () => {
  const line = CLEAN.decoys[0].line
  const r = resolveSubmit(CLEAN, [line], 0)
  assert.equal(r.kind, 'finish')
  if (r.kind === 'finish') {
    assert.equal(r.outcome, 'false-accusation')
    assert.equal(r.attempt, 1)
  }
})

test('подлянка из нескольких строк: нашёл одну — частично, все — найдено', () => {
  const multi = POOL.find((t) => t.bugs.length > 1)
  if (!multi) return // в паке пока все подлянки одиночные — тест ждёт своего часа

  const one = resolveSubmit(multi, [multi.bugs[0].line], 0)
  assert.equal(one.kind === 'finish' && one.outcome, 'partial')

  const all = resolveSubmit(multi, multi.bugs.map((b) => b.line), 0)
  assert.equal(all.kind === 'finish' && all.outcome, 'found')
})

test('истёкший таймер — пропуск без отмеченных строк', () => {
  assert.deepEqual(resolveTimeout(), {
    kind: 'finish',
    outcome: 'missed',
    attempt: MAX_ATTEMPTS + 1,
    picks: [],
    coverage: null,
  })
})

test('дневная серия кончается на последнем раунде, а не по пропускам', () => {
  assert.equal(isRunOver('daily', 0, 4, 3), false)
  assert.equal(isRunOver('daily', 3, 4, 0), true)
})

test('своя подборка кончается по своей длине, а не по дневной', () => {
  // Ровно на этом ломалось: конец считали по длине дневной серии, и подборка
  // из трёх задач уезжала за край массива.
  assert.equal(isRunOver('set', 1, 3, 0), false)
  assert.equal(isRunOver('set', 2, 3, 0), true)
})

test('бесконечный кончается на третьем пропуске, а не по номеру раунда', () => {
  assert.equal(isRunOver('endless', 99, 4, ENDLESS_LIVES - 1), false)
  assert.equal(isRunOver('endless', 0, 4, ENDLESS_LIVES), true)
})
