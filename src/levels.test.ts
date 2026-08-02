import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { availability, LEVELS, level, pickSet, playable, SET_SIZE } from './levels.ts'
import type { Stack, Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

const ALL = [...new Set(PACK.map((t) => t.stack))] as Stack[]

test('уровень никогда не даёт задачу выше своего потолка', () => {
  for (const { id, max } of LEVELS) {
    for (const task of pickSet(PACK, id, ALL, 'сид')) {
      assert.ok(task.difficulty <= max, `${id}: приехала сложность ${task.difficulty}`)
    }
  }
})

test('в подборке три задачи и все разные', () => {
  for (const { id } of LEVELS) {
    const set = pickSet(PACK, id, ALL, 'сид')
    assert.equal(set.length, SET_SIZE)
    assert.equal(new Set(set.map((t) => t.id)).size, SET_SIZE)
  }
})

test('сложность внутри подборки не убывает — это разгон, а не стена', () => {
  for (const { id } of LEVELS) {
    const set = pickSet(PACK, id, ALL, 'сид')
    for (let i = 1; i < set.length; i++) {
      assert.ok(set[i].difficulty >= set[i - 1].difficulty, `${id}: ${i} ниже предыдущей`)
    }
  }
})

test('выбран один язык — вся подборка на нём', () => {
  for (const stack of ALL) {
    const set = pickSet(PACK, 'senior', [stack], `один:${stack}`)
    assert.ok(set.length > 0, `${stack}: пусто`)
    for (const task of set) assert.equal(task.stack, stack)
  }
})

test('тот же сид и та же настройка дают ту же подборку', () => {
  const a = pickSet(PACK, 'middle', ALL, 'повтор')
  const b = pickSet(PACK, 'middle', ALL, 'повтор')
  assert.deepEqual(
    a.map((t) => t.id),
    b.map((t) => t.id),
  )
})

test('разные сиды дают разные подборки', () => {
  const seen = new Set(
    Array.from({ length: 12 }, (_, i) =>
      pickSet(PACK, 'middle', ALL, `сид-${i}`)
        .map((t) => t.id)
        .join(),
    ),
  )
  assert.ok(seen.size > 1, 'подборка не зависит от сида')
})

test('в списке языков — размер пула на уровне, а не раскладка тройки', () => {
  const counts = availability(PACK, 'senior', ALL)

  for (const stack of ALL) {
    assert.equal(counts.get(stack), PACK.filter((t) => t.stack === stack).length)
  }
})

test('потолок уровня режет доступное: у стажёра задач меньше, чем у сеньора', () => {
  const trainee = availability(PACK, 'trainee', ALL)
  const senior = availability(PACK, 'senior', ALL)

  for (const stack of ALL) {
    assert.ok((trainee.get(stack) ?? 0) <= (senior.get(stack) ?? 0), stack)
  }

  const totalTrainee = [...trainee.values()].reduce((a: number, b) => a + (b ?? 0), 0)
  const totalSenior = [...senior.values()].reduce((a: number, b) => a + (b ?? 0), 0)
  assert.ok(totalTrainee < totalSenior, 'потолок должен что-то отсекать')
})

test('язык без задач в паке — прочерк, а не ноль', () => {
  const counts = availability(PACK, 'senior', ['js', 'kotlin' as Stack])
  assert.equal(counts.get('kotlin' as Stack), null)
  assert.ok((counts.get('js') ?? 0) > 0)
})

test('на каждом языке есть чем занять стажёра', () => {
  for (const stack of ALL) {
    assert.ok(playable(PACK, 'trainee', stack), `${stack}: нет задач до сложности 2`)
  }
})

test('подборка не падает, когда выбранного языка не хватает на три задачи', () => {
  const thin = PACK.filter((t) => t.stack === 'go' && t.difficulty === 1)
  const set = pickSet(thin, 'senior', ['go'], 'мало')

  assert.ok(set.length >= 1 && set.length <= SET_SIZE)
})

test('неизвестный уровень не роняет игру', () => {
  assert.equal(level('внезапно' as never).id, 'junior')
})
