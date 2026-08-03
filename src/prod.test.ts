import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tick, type Defect } from './defects.ts'
import {
  afterCleanup,
  afterIncidentClosed,
  afterRound,
  afterTick,
  blastOf,
  isOver,
  MAX_HEALTH,
  START,
  summarize,
  verdict,
  type Prod,
} from './prod.ts'

function make(over: Partial<Defect> = {}): Defect {
  return {
    task: 'x',
    pr: 1,
    merged: 0,
    tag: 't',
    weight: 3,
    fuse: 2,
    leak: 0.6,
    known: false,
    ...over,
  }
}

const prod = (health: number, velocity = 60): Prod => ({ health, velocity })

test('смёрженный PR даёт скорость, заблокированный — нет. В этом и сделка', () => {
  assert.ok(afterRound(START, 'missed').velocity > START.velocity)
  assert.ok(afterRound(START, 'clean-correct').velocity > START.velocity)
  assert.ok(afterRound(START, 'missed').velocity > afterRound(START, 'found').velocity)
})

test('за правильно заблокированный PR не наказывают', () => {
  // Иначе идеальный ревьюер доезжает до увольнения за то, что делал работу.
  // Цена находки — потраченный ход, и её достаточно.
  assert.equal(afterRound(START, 'found').velocity, START.velocity)
})

test('а за неправильно — наказывают, и дороже всего', () => {
  const wrong = afterRound(START, 'false-accusation').velocity

  assert.ok(wrong < START.velocity)
  assert.ok(wrong < afterRound(START, 'found').velocity)
  assert.ok(wrong < afterRound(START, 'partial').velocity)
})

test('раунд не трогает здоровье — оно считается только на ходу', () => {
  for (const outcome of ['missed', 'found', 'partial', 'false-accusation'] as const) {
    assert.equal(afterRound(prod(80), outcome).health, 80)
  }
})

test('шкалы не выходят за края', () => {
  let p = prod(2, 1)
  for (let i = 0; i < 10; i++) p = afterRound(p, 'false-accusation')
  assert.equal(p.velocity, 0)

  let full = prod(100, 99)
  for (let i = 0; i < 10; i++) full = afterRound(full, 'missed')
  assert.equal(full.velocity, 100)

  assert.equal(afterTick(prod(3), tick([make({ fuse: 1, weight: 5 })])).health, 0)
  assert.equal(afterCleanup(prod(98)).health, MAX_HEALTH)
})

test('сработавший дефект бьёт по весу, лежащий — течёт', () => {
  const fired = afterTick(prod(100), tick([make({ fuse: 1, weight: 2 })]))
  assert.equal(fired.health, 100 - blastOf(make({ weight: 2 })))

  const quiet = afterTick(prod(100), tick([make({ fuse: 5, leak: 0.6 })]))
  assert.equal(quiet.health, 99.4)
})

test('тяжёлый дефект бьёт сильнее лёгкого', () => {
  for (let w = 2; w <= 5; w++) {
    assert.ok(blastOf(make({ weight: w })) > blastOf(make({ weight: w - 1 })))
  }
})

test('закрытый инцидент возвращает половину', () => {
  const defect = make({ weight: 3 })
  const after = afterTick(prod(100), tick([{ ...defect, fuse: 1 }]))

  assert.equal(afterIncidentClosed(after, defect).health, 100 - blastOf(defect) / 2)
})

test('два разных проигрыша не путаются', () => {
  assert.equal(verdict(START), 'alive')
  assert.equal(verdict(prod(0, 50)), 'burned')
  assert.equal(verdict(prod(50, 0)), 'fired')
  assert.ok(isOver(prod(0, 50)) && isOver(prod(50, 0)) && !isOver(START))
})

test('тихая смена всё равно кончается хуже, чем началась', () => {
  // Три пропуска на старте, дальше игрок не делает ничего плохого —
  // и всё равно теряет здоровье: в этом и смысл накопления.
  let defects = [make({ fuse: 6, weight: 2, leak: 0.45 })]
  let p = START

  for (let turn = 0; turn < 5; turn++) {
    const t = tick(defects)
    defects = t.defects
    p = afterTick(p, t)
  }

  assert.ok(p.health < START.health)
  assert.equal(defects.length, 1, 'фитиль ещё не догорел')
})

test('сводка считает долг из дефектов, а не хранит его отдельно', () => {
  const s = summarize(prod(40), [make({ weight: 1 }), make({ weight: 4 })])

  assert.equal(s.debt, 5)
  assert.equal(s.defects, 2)
  assert.equal(s.verdict, 'alive')
})
