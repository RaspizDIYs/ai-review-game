import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  accuracy,
  isCorrectLine,
  roundDuration,
  roundScore,
  timeMultiplier,
  ROUND_SECONDS,
} from './scoring.ts'
import { parseDiff } from './diff.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

test('множитель времени не падает ниже 0.2', () => {
  assert.equal(timeMultiplier(0), 0.2)
  assert.equal(timeMultiplier(ROUND_SECONDS), 1)
})

test('множитель считается от длительности этого раунда, а не от базовых 90', () => {
  const tired = roundDuration(1)
  assert.equal(timeMultiplier(tired, tired), 1)
  // Мгновенный ответ в укороченном раунде стоит столько же, сколько в полном:
  // усталость отнимает время, а не очки сверху.
  assert.equal(
    roundScore(3, tired, 1, tired),
    roundScore(3, ROUND_SECONDS, 1, ROUND_SECONDS),
  )
})

test('вторая попытка стоит дешевле первой, пропуск — ноль', () => {
  const full = { found: 1, total: 1, extras: 0 }
  assert.equal(accuracy('found', 1, full), 1)
  assert.equal(accuracy('found', 2, full), 0.6)
  assert.equal(accuracy('clean-correct', 1, null), 1)
  assert.equal(accuracy('missed', 1, null), 0)
  assert.equal(accuracy('false-accusation', 1, null), 0)
})

test('частичный ответ считается по покрытию, а лишние строки его режут', () => {
  const half = accuracy('partial', 1, { found: 1, total: 2, extras: 0 })
  const halfWithExtra = accuracy('partial', 1, { found: 1, total: 2, extras: 1 })

  assert.equal(half, 0.5)
  assert.ok(halfWithExtra < half, 'лишняя строка должна удешевлять ответ')
  // Честно найденная часть без лишних обвинений не падает ниже четверти:
  // строку-то нашёл.
  assert.ok(accuracy('partial', 1, { found: 1, total: 4, extras: 0 }) >= 0.25)
})

test('дробовик не защищён порогом: чем больше лишних, тем ближе к нулю', () => {
  // Натыкать полфайла и попасть — это не «нашёл частично». Порог тут
  // не действует, иначе обвинение всего подряд стабильно приносит четверть
  // очков и в бесконечном режиме не даёт проиграть.
  const shotgun = accuracy('partial', 1, { found: 1, total: 1, extras: 30 })

  assert.ok(shotgun < 0.05, `дробовик принёс ${shotgun}`)
  assert.ok(shotgun > 0, 'но и не ноль: строку он всё-таки задел')
})

test('точность падает с каждой лишней строкой монотонно', () => {
  const acc = (extras: number) => accuracy('partial', 1, { found: 2, total: 3, extras })

  for (let e = 1; e < 8; e++) assert.ok(acc(e) < acc(e - 1), `${e}: не упало`)
})

test('частичный ответ никогда не дороже полного', () => {
  const full = accuracy('found', 1, { found: 2, total: 2, extras: 0 })
  const partial = accuracy('partial', 1, { found: 2, total: 2, extras: 1 })
  assert.ok(partial < full)
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
