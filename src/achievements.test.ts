import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACHIEVEMENTS,
  derivedUnlocks,
  dossierUnlocks,
  langAchievement,
  ownedCount,
  roundUnlocks,
  runUnlocks,
  shiftUnlocks,
  STAFF_XP,
} from './achievements.ts'
import { STACKS } from './stacks.ts'
import type { Task } from './types.ts'

const TASK = {
  id: 'py-x-001',
  stack: 'py',
  difficulty: 2,
  title: 'т',
  prompt: 'п',
  tests: 'ok',
  diff: '',
  clean: false,
  bugs: [{ file: 'a.py', line: 1, kind: 'wrong', tag: 'x', explain: '', consequence: '' }],
  decoys: [],
  verified_by: '',
  verified_at: '',
} as unknown as Task

function round(over: Partial<Parameters<typeof roundUnlocks>[0]> = {}) {
  return roundUnlocks({
    task: TASK,
    outcome: 'found',
    spent: 40,
    foundStreak: 1,
    lifetime: 0,
    found: 1,
    ...over,
  })
}

test('id уникальны', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length)
})

test('на каждый язык пака есть своя ачивка', () => {
  for (const stack of STACKS) {
    assert.ok(
      ACHIEVEMENTS.some((a) => a.id === langAchievement(stack)),
      `нет ачивки для ${stack}`,
    )
  }
})

test('найденная подлянка открывает язык задачи', () => {
  assert.ok(round().includes('lang-py'))
  assert.ok(!round({ outcome: 'missed' }).includes('lang-py'))
})

test('пороги пойманных подлянок срабатывают по накоплению', () => {
  assert.ok(!round({ found: 9 }).includes('found10'))
  assert.ok(round({ found: 10 }).includes('found10'))
  // Порог не «ровно столько»: за пропущенный раунд ачивку не теряют.
  assert.ok(round({ found: 30 }).includes('found25'))
  assert.ok(!round({ found: 30 }).includes('found50'))
})

test('скорость: двадцать секунд и десять — разные ачивки', () => {
  assert.deepEqual(
    round({ spent: 15 }).filter((id) => id === 'fast' || id === 'blitz'),
    ['fast'],
  )
  const quick = round({ spent: 5 })
  assert.ok(quick.includes('fast') && quick.includes('blitz'))
})

test('серия дня и ночное дежурство считаются по своим режимам', () => {
  const clean = ['found', 'found', 'clean-correct'] as const
  assert.ok(runUnlocks({ mode: 'daily', outcomes: clean, streak: 1 }).includes('perfect'))
  assert.ok(!runUnlocks({ mode: 'set', outcomes: clean, streak: 9 }).includes('perfect'))
  assert.ok(runUnlocks({ mode: 'daily', outcomes: clean, streak: 7 }).includes('week'))

  const long = Array.from({ length: 12 }, () => 'found' as const)
  assert.ok(runUnlocks({ mode: 'endless', outcomes: long, streak: 0 }).includes('night'))
  assert.ok(!runUnlocks({ mode: 'endless', outcomes: clean, streak: 0 }).includes('night'))
})

test('полиглот открывается только когда собраны все языки', () => {
  const all = STACKS.map(langAchievement)
  assert.deepEqual(derivedUnlocks(all.slice(0, -1)), [])
  assert.ok(derivedUnlocks(all).includes('polyglot'))
})

test('коллекционер требует всё остальное', () => {
  const rest = ACHIEVEMENTS.filter((a) => a.id !== 'collector').map((a) => a.id)
  assert.ok(!derivedUnlocks(rest.slice(1)).includes('collector'))
  assert.ok(derivedUnlocks(rest).includes('collector'))
})

test('стафф — тот же порог, что у верхнего ранга', () => {
  assert.ok(round({ lifetime: STAFF_XP }).includes('staff'))
  assert.ok(!round({ lifetime: STAFF_XP - 1 }).includes('staff'))
})

test('чужие id из старых сохранений не считаются полученными', () => {
  assert.equal(ownedCount(['python', 'first']), 1)
})

test('смена награждает только за доигранную и выжившую', () => {
  const base = { alive: true, finished: true, crashes: 0, cured: false, day: 1 }

  assert.ok(shiftUnlocks(base).includes('shift'))
  assert.ok(shiftUnlocks(base).includes('steady'))
  assert.ok(!shiftUnlocks({ ...base, crashes: 2 }).includes('steady'))

  // Брошенная посреди и сгоревшая не дают ничего.
  assert.deepEqual(shiftUnlocks({ ...base, finished: false }), [])
  assert.deepEqual(shiftUnlocks({ ...base, alive: false }), [])
})

test('пожарного дают даже за проигранную смену', () => {
  // Прод всё равно сгорел, но руками его чинили — это отдельный навык.
  const ids = shiftUnlocks({ alive: false, finished: true, crashes: 3, cured: true, day: 2 })
  assert.deepEqual(ids, ['firefighter'])
})

test('пятый день отмечается только с пятого', () => {
  const base = { alive: true, finished: true, crashes: 0, cured: false }
  assert.ok(!shiftUnlocks({ ...base, day: 4 }).includes('veteran'))
  assert.ok(shiftUnlocks({ ...base, day: 5 }).includes('veteran'))
})

test('досье: профайлер за одного, кадровик за всех', () => {
  const full = { a: 4, b: 4 }

  assert.deepEqual(dossierUnlocks({ a: 3 }, full), [])
  assert.deepEqual(dossierUnlocks({ a: 4 }, full), ['profiler'])
  assert.deepEqual(dossierUnlocks({ a: 4, b: 4 }, full), ['profiler', 'headhunter'])
})
