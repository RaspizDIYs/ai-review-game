import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OPTION_COUNT, reasonOptions } from './reason.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)
const REASONS: Record<string, string> = JSON.parse(
  readFileSync(new URL('./content/reasons.json', import.meta.url), 'utf8'),
)

const dirty = PACK.filter((t) => !t.clean)

test('у каждой подлянки в паке есть формулировка', () => {
  for (const task of dirty) {
    for (const bug of task.bugs) {
      assert.ok(REASONS[bug.tag], `${task.id}: нет формулировки для «${bug.tag}»`)
    }
  }
})

for (const task of dirty) {
  test(`${task.id}: четыре разных варианта, среди них ровно один верный`, () => {
    const options = reasonOptions(task, PACK, REASONS)

    assert.equal(options.length, OPTION_COUNT)
    assert.equal(options.filter((o) => o.right).length, 1)
    assert.equal(new Set(options.map((o) => o.text)).size, OPTION_COUNT)
    assert.equal(options.find((o) => o.right)!.tag, task.bugs[0].tag)
  })
}

test('варианты одинаковы у всех игроков и не зависят от порядка пака', () => {
  const task = dirty[0]
  const shuffled = [...PACK].reverse()

  assert.deepEqual(reasonOptions(task, PACK, REASONS), reasonOptions(task, shuffled, REASONS))
})

test('верный вариант стоит не всегда первым', () => {
  const positions = new Set(
    dirty.map((t) => reasonOptions(t, PACK, REASONS).findIndex((o) => o.right)),
  )
  assert.ok(positions.size > 1, 'позиция верного варианта предсказуема')
})

test('на чистом раунде выбирать нечего', () => {
  const clean = PACK.find((t) => t.clean)!
  assert.deepEqual(reasonOptions(clean, PACK, REASONS), [])
})

test('тег без формулировки не роняет игру, а выключает шаг', () => {
  const task = dirty[0]
  const withoutIt = Object.fromEntries(
    Object.entries(REASONS).filter(([k]) => k !== task.bugs[0].tag),
  )
  assert.deepEqual(reasonOptions(task, PACK, withoutIt), [])
})

test('отвлекающие берутся из того же стека, пока их хватает', () => {
  const task = dirty.find((t) => t.stack === 'sql')!
  const sqlTags = new Set(
    PACK.filter((t) => t.stack === 'sql').flatMap((t) => t.bugs.map((b) => b.tag)),
  )

  for (const option of reasonOptions(task, PACK, REASONS)) {
    assert.ok(sqlTags.has(option.tag), `${option.tag} не из sql`)
  }
})
