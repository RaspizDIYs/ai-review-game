import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  born,
  debt,
  rework,
  rollback,
  state,
  tick,
  weakest,
  without,
  type Defect,
} from './defects.ts'
import type { Outcome, Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

const DIRTY = PACK.find((t) => !t.clean)!
const CLEAN = PACK.find((t) => t.clean)!

function make(over: Partial<Defect> = {}): Defect {
  return { task: 'x', pr: 1, merged: 0, tag: 't', weight: 3, fuse: 2, leak: 0.6, known: false, crashes: 0, ...over }
}

test('в прод уезжает только то, что не поймали', () => {
  const leaves: Outcome[] = ['missed', 'partial']
  const clears: Outcome[] = ['found', 'clean-correct', 'false-accusation']

  for (const outcome of leaves) {
    assert.ok(born(DIRTY, outcome, 1408, 0), `${outcome} должен оставить дефект`)
  }
  for (const outcome of clears) {
    assert.equal(born(DIRTY, outcome, 1408, 0), null, `${outcome} не оставляет дефект`)
  }
})

test('на чистом PR пропускать нечего', () => {
  assert.equal(born(CLEAN, 'missed', 1408, 0), null)
})

test('дефект детерминирован: тот же PR — тот же фитиль', () => {
  assert.deepEqual(born(DIRTY, 'missed', 1408, 0), born(DIRTY, 'missed', 1408, 0))
})

test('фитиль укладывается в 2..6 на всём паке', () => {
  for (const task of PACK.filter((t) => !t.clean)) {
    for (let pr = 1408; pr < 1420; pr++) {
      const d = born(task, 'missed', pr, 0)!
      assert.ok(d.fuse >= 2 && d.fuse <= 6, `${task.id}#${pr}: фитиль ${d.fuse}`)
      assert.ok(d.weight >= 1 && d.weight <= 5, `${task.id}#${pr}: вес ${d.weight}`)
      assert.ok(d.leak > 0, `${task.id}#${pr}: нулевая утечка`)
    }
  }
})

test('частично найденная подлянка бьёт слабее целиком пропущенной', () => {
  const hard = PACK.find((t) => !t.clean && t.difficulty >= 3)!
  const missed = born(hard, 'missed', 1408, 0)!
  const partial = born(hard, 'partial', 1408, 0)!

  assert.equal(missed.weight, hard.difficulty)
  assert.equal(partial.weight, hard.difficulty - 1)
  assert.ok(partial.leak < missed.leak)
})

test('дефект помнит, на каком PR и ходу его пропустили', () => {
  const d = born(DIRTY, 'missed', 1411, 3)!
  assert.equal(d.pr, 1411)
  assert.equal(d.merged, 3)
  assert.equal(d.task, DIRTY.id)
  assert.equal(d.tag, DIRTY.bugs[0].tag)
})

test('ход укорачивает фитиль, догоревший становится известным', () => {
  const first = tick([make({ fuse: 2 }), make({ fuse: 1, weight: 1, leak: 0.3 })])

  assert.equal(first.fired.length, 1)
  assert.equal(first.fired[0].weight, 1)
  assert.equal(first.fired[0].known, true)

  // Сработавший остаётся в проде: вслепую его ещё надо опознать и вылечить,
  // а лечить нечего, если он исчезает вместе со взрывом.
  assert.equal(first.defects.length, 2)
  assert.deepEqual(
    first.defects.filter((d) => !d.known).map((d) => d.fuse),
    [1],
  )
})

test('известный дефект роняет прод каждый ход, пока его не починят', () => {
  // Критическая ошибка не «подтекает» — она валит сервис снова и снова.
  // Пока не починена руками, каждый ход это новое падение.
  const known = tick([make({ fuse: 1 })]).defects

  for (let turn = 0; turn < 3; turn++) {
    const next = tick(known)
    assert.equal(next.fired.length, 1, `ход ${turn}: прод обязан упасть снова`)
    assert.equal(next.defects.length, 1, 'и остаться сломанным')
    assert.equal(next.leak, 0, 'падение считается ударом, а не утечкой')
  }
})

test('скрытый течёт, известный падает — это разные вещи', () => {
  const hidden = tick([make({ fuse: 5, leak: 0.6 })])
  assert.equal(hidden.fired.length, 0)
  assert.ok(hidden.leak > 0)

  const known = tick([make({ fuse: 5, leak: 0.6, known: true })])
  assert.equal(known.fired.length, 1)
  assert.equal(known.leak, 0)
})

test('утечку платят все, кто лежал, кроме рванувшего на этом ходу', () => {
  // Дефект, который рванул именно сейчас, платит своим весом —
  // брать с него ещё и за тихую жизнь было бы двойным счётом.
  const t = tick([make({ fuse: 1, leak: 0.9 }), make({ fuse: 4, leak: 0.3 })])

  assert.equal(t.leak, 0.3)
})

test('состояние прода читается без чисел', () => {
  assert.equal(state([]), 'clean')
  assert.equal(state([make({ fuse: 4 })]), 'leaking')
  assert.equal(state([make({ fuse: 4 }), make({ known: true })]), 'falling')
})

test('пустой прод не течёт', () => {
  const t = tick([])
  assert.deepEqual(t, { defects: [], fired: [], leak: 0 })
})

test('ход не меняет исходный список', () => {
  const before = [make({ fuse: 1 })]
  tick(before)
  assert.equal(before[0].fuse, 1)
})

test('долг — сумма весов, а не число дефектов', () => {
  assert.equal(debt([make({ weight: 1 }), make({ weight: 4 })]), 5)
  assert.equal(debt([]), 0)
})

test('уборка берёт самый лёгкий, при равном весе — самый старый', () => {
  const old = make({ weight: 2, merged: 1, pr: 1 })
  const young = make({ weight: 2, merged: 5, pr: 2 })
  const heavy = make({ weight: 5, merged: 0, pr: 3 })

  assert.equal(weakest([heavy, young, old]), old)
  assert.equal(weakest([]), null)
})

test('откат убирает мину того самого PR и говорит, попал ли ты', () => {
  const guilty = make({ pr: 1411, known: true })
  const other = make({ pr: 1409 })

  const hit = rollback([guilty, other], 1411)
  assert.equal(hit.hit, true)
  assert.deepEqual(hit.defects, [other])

  // Откатили здоровый PR: прод не изменился, а фича потеряна.
  const miss = rollback([guilty, other], 1407)
  assert.equal(miss.hit, false)
  assert.deepEqual(miss.defects, [guilty, other])
})

test('доработка лечит не всегда, но одинаково на одном и том же дефекте', () => {
  const defects = [make({ pr: 1411, known: true })]

  assert.deepEqual(rework(defects, 1411), rework(defects, 1411))
  // Чужой PR доработкой не лечится никогда.
  assert.equal(rework(defects, 1408).hit, false)
})

test('доработка иногда лечит, а иногда нет — иначе выбирать не из чего', () => {
  const cured = []
  for (let pr = 1400; pr < 1440; pr++) {
    cured.push(rework([make({ pr, task: `t-${pr}`, known: true })], pr).hit)
  }

  assert.ok(cured.some(Boolean), 'ни разу не вылечила')
  assert.ok(cured.some((c) => !c), 'лечит всегда — тогда это откат без цены')
})

test('убранный дефект исчезает, остальные на месте', () => {
  const a = make({ pr: 1 })
  const b = make({ pr: 2 })

  assert.deepEqual(without([a, b], a), [b])
  assert.deepEqual(without([a], make({ pr: 9 })), [a])
})

