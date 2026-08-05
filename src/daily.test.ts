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

test('задачи внутри серии не повторяются', () => {
  for (const day of ['2026-08-02', '2026-09-14', '2027-01-01']) {
    const ids = pickDaily(POOL, day).map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length, `дубликат в серии ${day}`)
  }
})

test('в серии ровно столько раундов, сколько в плане сложностей', () => {
  assert.ok(POOL.length > DIFFICULTY_PLAN.length, 'пак меньше серии — раундов будет меньше')
  assert.equal(pickDaily(POOL, '2026-08-02').length, DIFFICULTY_PLAN.length)
})

test('сложность в серии растёт, а не скачет', () => {
  const got = pickDaily(POOL, '2026-08-02').map((t) => t.difficulty)
  assert.deepEqual([...got].sort((a, b) => a - b), got, `серия ${got}`)
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

// Ради этого колода и появилась: с ростом пака задачи должны разъезжаться
// по дням сами, без ручной настройки.
test('задача не повторяется на следующий день', () => {
  for (let i = 0; i < 30; i++) {
    const today = new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10)
    const a = new Set(pickDaily(POOL, today).map((t) => t.id))
    const overlap = pickDaily(POOL, tomorrow).filter((t) => a.has(t.id))
    assert.equal(overlap.length, 0, `${today} и ${tomorrow} пересеклись: ${overlap.map((t) => t.id)}`)
  }
})

test('за две недели пак прокручивается широко, а не крутит одну пятёрку', () => {
  const seen = new Set<string>()
  let drawn = 0
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10)
    for (const t of pickDaily(POOL, day)) {
      seen.add(t.id)
      drawn++
    }
  }

  // Считаем долю от выданных задач, а не от размера пака: за две недели
  // выдаётся семьдесят штук, и с ростом пака порог «шестьдесят процентов
  // пака» становится недостижимым арифметически, а не по существу.
  // Проверяем то, ради чего тест написан: мало ли повторов внутри двух недель.
  assert.ok(
    seen.size >= drawn * 0.8,
    `за 14 дней ${drawn} задач, из них разных только ${seen.size}`,
  )
})

test('чистая задача выпадает только в чистый день и только последней', () => {
  for (let i = 0; i < 60; i++) {
    const day = new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10)
    const series = pickDaily(POOL, day)
    series.forEach((task, idx) => {
      if (!task.clean) return
      assert.ok(lastRoundIsClean(day), `${day}: чистая задача в обычный день`)
      assert.equal(idx, series.length - 1, `${day}: чистая задача не последней`)
    })
  }
})

test('добавление задач в пак не ломает выбор', () => {
  const grown = [...POOL, ...synthetic(12)]
  const series = pickDaily(grown, '2026-08-02')
  assert.equal(series.length, DIFFICULTY_PLAN.length)
  assert.equal(new Set(series.map((t) => t.id)).size, series.length)
})

test('бесконечный режим наращивает сложность и не падает на исчерпанном пуле', () => {
  const seed = 'seed'
  for (let i = 0; i < 20; i++) {
    assert.ok(pickEndless(POOL, seed, i))
  }
  assert.equal(pickEndless(POOL, seed, 3).id, pickEndless(POOL, seed, 3).id)
})

// Ровно тот случай, который сломался: сложность росла, грязных задач на верхних
// сложностях не было, и с девятого раунда шли одни чистые подряд.
test('в бесконечном чистые раунды идут по счёту, а не подряд в конце', () => {
  const run = Array.from({ length: 25 }, (_, i) => pickEndless(POOL, 'seed', i))
  const clean = run.map((t) => t.clean)

  for (let i = 1; i < clean.length; i++) {
    assert.ok(!(clean[i] && clean[i - 1]), `два чистых подряд на раундах ${i - 1} и ${i}`)
  }
  const share = clean.filter(Boolean).length / clean.length
  assert.ok(share > 0.1 && share < 0.35, `чистых ${Math.round(share * 100)}%`)
})

test('в бесконечном задача не повторяется, пока помним недавние', () => {
  const recent: string[] = []
  for (let i = 0; i < 25; i++) {
    const task = pickEndless(POOL, 'seed', i, recent.slice(-5))
    assert.ok(!recent.slice(-5).includes(task.id), `повтор ${task.id} на раунде ${i}`)
    recent.push(task.id)
  }
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
