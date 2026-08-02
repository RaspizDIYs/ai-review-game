import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  challengeNumber,
  dayKey,
  DIFFICULTY_PLAN,
  fnv1a,
  lastRoundIsClean,
  msUntilNextDay,
  pickDaily,
  pickEndless,
} from './daily.ts'
import { buildShare, formatTime } from './share.ts'
import { roundDuration, ROUND_SECONDS } from './scoring.ts'
import type { Task } from './types.ts'

const POOL: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

test('хэш стабилен и не зависит от запуска', () => {
  assert.equal(fnv1a('2026-08-02'), fnv1a('2026-08-02'))
  assert.notEqual(fnv1a('2026-08-02'), fnv1a('2026-08-03'))
})

test('ключ дня берётся по UTC', () => {
  // 23:30 по Москве 2 августа — это ещё 20:30 UTC того же дня.
  assert.equal(dayKey(new Date('2026-08-02T20:30:00Z')), '2026-08-02')
  // А 02:30 по Москве 3 августа — ещё 2 августа по UTC, серия та же.
  assert.equal(dayKey(new Date('2026-08-02T23:30:00Z')), '2026-08-02')
  assert.equal(dayKey(new Date('2026-08-03T00:01:00Z')), '2026-08-03')
})

test('нумерация челленджей начинается с первого', () => {
  assert.equal(challengeNumber('2026-08-02'), 1)
  assert.equal(challengeNumber('2026-08-12'), 11)
})

test('до следующего дня остаётся положительное время, меньше суток', () => {
  const ms = msUntilNextDay(new Date('2026-08-02T20:30:00Z'))
  assert.ok(ms > 0 && ms <= 86_400_000)
  assert.equal(ms, 3.5 * 3_600_000)
})

// Главное свойство дневного челленджа: у всех одно и то же.
test('серия дня воспроизводится побайтово', () => {
  const a = pickDaily(POOL, '2026-08-02').map((t) => t.id)
  const b = pickDaily(POOL, '2026-08-02').map((t) => t.id)
  assert.deepEqual(a, b)
})

/** Пак нужного размера, какого он станет после M2. */
function synthetic(count: number): Task[] {
  return Array.from({ length: count }, (_, i) => ({
    ...POOL[i % POOL.length],
    id: `synthetic-${i}`,
    difficulty: ((i % 5) + 1) as Task['difficulty'],
    clean: i % 7 === 0,
  }))
}

test('на паке боевого размера серии в разные дни отличаются', () => {
  const pool = synthetic(30)
  const series = Array.from({ length: 14 }, (_, i) =>
    pickDaily(pool, new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10))
      .map((t) => t.id)
      .join(),
  )
  assert.ok(new Set(series).size >= 10, `за 14 дней всего ${new Set(series).size} разных серий`)
})

// Известное ограничение, а не баг: пока задач в паке столько же, сколько слотов
// в серии, каждый день выпадают все они, и план сложностей задаёт один и тот же
// порядок. Уходит само, как только пак перевалит за пять задач — это M2.
test('на паке меньше пяти задач серия одинаковая каждый день', () => {
  assert.ok(POOL.length <= DIFFICULTY_PLAN.length, 'пак вырос — тест пора удалить')
  const a = pickDaily(POOL, '2026-08-02').map((t) => t.id)
  const b = pickDaily(POOL, '2027-03-19').map((t) => t.id)
  assert.deepEqual(a, b)
})

test('задачи внутри серии не повторяются', () => {
  for (const day of ['2026-08-02', '2026-09-14', '2027-01-01']) {
    const ids = pickDaily(POOL, day).map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length, `дубликат в серии ${day}`)
  }
})

test('серия не длиннее пака — пока задач меньше пяти, раундов тоже меньше', () => {
  const series = pickDaily(POOL, '2026-08-02')
  assert.equal(series.length, Math.min(DIFFICULTY_PLAN.length, POOL.length))
})

test('серия из одной задачи не падает', () => {
  assert.equal(pickDaily([POOL[0]], '2026-08-02').length, 1)
})

test('чистый последний раунд выпадает примерно раз в пять дней', () => {
  let clean = 0
  for (let i = 0; i < 100; i++) {
    const day = new Date(Date.UTC(2026, 7, 2) + i * 86_400_000).toISOString().slice(0, 10)
    if (lastRoundIsClean(day)) clean++
  }
  assert.ok(clean >= 10 && clean <= 30, `чистых дней ${clean} из 100`)
})

test('бесконечный режим наращивает сложность и не падает на исчерпанном пуле', () => {
  const seed = 'seed'
  for (let i = 0; i < 20; i++) {
    assert.ok(pickEndless(POOL, seed, i))
  }
  assert.equal(pickEndless(POOL, seed, 3).id, pickEndless(POOL, seed, 3).id)
})

test('усталость режет время, но не ниже минимума', () => {
  assert.equal(roundDuration(0), ROUND_SECONDS)
  assert.equal(roundDuration(1), 75)
  assert.equal(roundDuration(2), 60)
  assert.equal(roundDuration(9), 45)
})

test('строка шеринга не содержит ни кода, ни названий задач', () => {
  const share = buildShare('2026-08-02', ['found', 'found', 'missed', 'clean-correct'], 72)
  assert.equal(share, 'Ревью за ИИ #1\n🟩🟩🟥🟩  3/4  1:12')
  for (const task of POOL) {
    assert.ok(!share.includes(task.title))
    assert.ok(!share.includes(task.id))
  }
})

test('обвинение чистого кода отмечается своим квадратом', () => {
  assert.ok(buildShare('2026-08-02', ['false-accusation'], 5).includes('⬜'))
})

test('время форматируется с ведущим нулём', () => {
  assert.equal(formatTime(72), '1:12')
  assert.equal(formatTime(5), '0:05')
  assert.equal(formatTime(600), '10:00')
})
