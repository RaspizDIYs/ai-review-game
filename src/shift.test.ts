/**
 * Спецификация смены. Написана до реализации: пока `shift.ts` — заглушки,
 * эти тесты красные, и это нормальное состояние работы.
 *
 * Каждый тест здесь — утверждение о правилах игры, а не о коде. Если правило
 * меняется, сначала меняется тест.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { born, debt, type Defect } from './defects.ts'
import { MAX_HEALTH, START } from './prod.ts'
import {
  carry,
  CLEANUPS,
  cleanup,
  finish,
  isCheckpoint,
  isShiftOver,
  merged,
  merges,
  probe,
  PROBES,
  repair,
  restore,
  review,
  SHIFT_TURNS,
  start,
  watch,
  type Shift,
} from './shift.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

/** Грязная задача сложности 3: вес дефекта заметный, но не смертельный. */
const DIRTY = PACK.find((t) => !t.clean && t.difficulty === 3)!
const CLEAN = PACK.find((t) => t.clean)!

/** Прогнать несколько ходов подряд, чтобы фитили догорели. */
function turns(shift: Shift, count: number, task: Task = CLEAN): Shift {
  let s = shift
  for (let i = 0; i < count; i++) s = review(s, task, 'clean-correct').shift
  return s
}

/** Дефект с заданными параметрами — там, где важен фитиль, а не задача. */
function mine(over: Partial<Defect> = {}): Defect {
  return {
    task: 'x',
    pr: 1408,
    merged: 0,
    tag: 't',
    weight: 3,
    fuse: 4,
    leak: 0.6,
    known: false,
    crashes: 0,
    ...over,
  }
}

/** Смена с готовым продом: некоторые правила проверяются только на просевшем. */
function withDefects(defects: Defect[], health = MAX_HEALTH): Shift {
  return { ...start(), prod: { health, velocity: START.velocity }, defects }
}


test('заблокированный PR не мёржится', () => {
  assert.equal(merges('missed'), true)
  assert.equal(merges('partial'), true)
  assert.equal(merges('clean-correct'), true)
  assert.equal(merges('found'), false)
  assert.equal(merges('false-accusation'), false)
})

test('новая смена начинается со здорового пустого прода', () => {
  const s = start()

  assert.equal(s.turn, 0)
  assert.equal(s.turns, SHIFT_TURNS)
  assert.deepEqual(s.prod, START)
  assert.deepEqual(s.defects, [])
  assert.deepEqual(s.log, [])
  assert.ok(s.pr > 0, 'номер PR должен быть человеческим, а не нулём')
})

test('следующая смена принимает прод, дефекты и нумерацию прошлой', () => {
  const first = review(start(), DIRTY, 'missed').shift
  const second = start(carry(first))

  assert.deepEqual(second.prod, first.prod)
  assert.deepEqual(second.defects, first.defects)
  assert.equal(second.pr, first.pr, 'нумерация PR не сбрасывается между сменами')
  assert.equal(second.turn, 0, 'а ходы — сбрасываются')
  assert.deepEqual(second.log, [], 'журнал у каждой смены свой')
})

test('пропуск мёржит PR и оставляет дефект в проде', () => {
  const s = review(start(), DIRTY, 'missed').shift

  assert.equal(s.defects.length, 1)
  assert.equal(s.defects[0].pr, start().pr, 'дефект помнит номер того самого PR')
  assert.equal(s.log.at(-1)?.kind, 'merged')
  assert.ok(s.prod.velocity > START.velocity, 'команда довольна: PR уехал')
})

test('находка блокирует PR: прод чист, скорость не выросла', () => {
  const s = review(start(), DIRTY, 'found').shift

  assert.deepEqual(s.defects, [])
  assert.equal(s.log.at(-1)?.kind, 'blocked')
  assert.equal(s.prod.velocity, START.velocity, 'за найденную подлянку не наказывают')
  assert.ok(s.prod.velocity < review(start(), DIRTY, 'missed').shift.prod.velocity)
})

test('ход и номер PR растут на каждом ревью, чем бы оно ни кончилось', () => {
  const first = start()
  const after = review(review(first, DIRTY, 'found').shift, DIRTY, 'missed').shift

  assert.equal(after.turn, 2)
  assert.equal(after.pr, first.pr + 2)
})

test('дефект не тикает на том же ходу, на котором родился', () => {
  // Иначе обещание «фитиль на два хода» врёт: игрок получает алерт на ход раньше,
  // чем ему показали, и связь между пропуском и инцидентом рассыпается.
  const s = review(start(), DIRTY, 'missed').shift
  const expected = born(DIRTY, 'missed', start().pr, 0)!

  assert.equal(s.defects[0].fuse, expected.fuse)
})

test('догоревший фитиль превращается в инцидент с адресом виновного', () => {
  const first = review(start(), DIRTY, 'missed').shift
  const defect = first.defects[0]

  let s = first
  let fired: ReturnType<typeof review>['fired'] = []
  for (let i = 0; i < defect.fuse; i++) {
    const step = review(s, CLEAN, 'clean-correct')
    s = step.shift
    if (step.fired.length > 0) fired = step.fired
  }

  assert.equal(fired.length, 1, 'дефект обязан рвануть ровно через fuse ходов')
  // Сработавший остаётся лежать известным: вслепую его ещё надо опознать.
  assert.deepEqual(
    s.defects.map((d) => d.known),
    [true],
  )

  const incident = s.log.find((e) => e.kind === 'incident')
  assert.ok(incident, 'инцидент попадает в журнал')
  assert.equal(incident.kind === 'incident' && incident.pr, defect.pr)
  assert.equal(incident.kind === 'incident' && incident.merged, 0)
  assert.equal(incident.kind === 'incident' && incident.tag, defect.tag)
})

test('инцидент бьёт по здоровью, тихий дефект — течёт', () => {
  // Смену собираем руками: фитиль задачи из пака зависит от её id, и тест
  // про утечку не должен зависеть от того, какая задача попалась первой.
  const lying = withDefects([mine({ fuse: 5, weight: 3, leak: 0.6 })])

  const quiet = review(lying, CLEAN, 'clean-correct').shift
  assert.ok(quiet.prod.health < MAX_HEALTH, 'утечка идёт, даже пока ничего не рвануло')
  assert.ok(quiet.prod.health > MAX_HEALTH - 5, 'но она именно утечка, а не удар')

  const blown = turns(lying, 5)
  assert.ok(blown.prod.health < quiet.prod.health - 5, 'инцидент дороже утечки')
})

test('уборок на смену три, и каждая закрывает одну мину наверняка', () => {
  const s0 = withDefects([mine({ pr: 1, weight: 1, fuse: 6 }), mine({ pr: 2, weight: 2, fuse: 6 })], 70)
  assert.equal(s0.cleanups, CLEANUPS)

  const s1 = cleanup(s0).shift
  assert.equal(s1.cleanups, CLEANUPS - 1)
  assert.equal(s1.defects.length, 1, 'мина закрыта на сто процентов, а не «может быть»')

  const s2 = cleanup(s1).shift
  const s3 = cleanup(s2).shift
  assert.equal(s3.cleanups, 0)

  // Четвёртой уборки нет: ничего не происходит.
  const s4 = cleanup(s3).shift
  assert.deepEqual(s4, s3)
})

test('уборка тратит заряд, а не ход, и всегда только лечит', () => {
  // Раньше она была ходом, а на ходу падает прод — и разгрести долг значило
  // потерять здоровье. Кнопка обещала «+5», а показывала минус.
  const s = withDefects([mine({ pr: 1, weight: 1, fuse: 6 }), mine({ pr: 2, known: true })], 70)
  const after = cleanup(s).shift

  assert.equal(after.turn, s.turn, 'ход не тратится')
  assert.ok(after.prod.health > s.prod.health, 'здоровье только вверх')
  assert.deepEqual(
    after.defects.map((d) => d.pr),
    [2],
    'закрыта тихая мина, упавший прод остался на месте',
  )
})

test('уборка не двигает фитили: это не ход', () => {
  const s = withDefects([mine({ pr: 1, weight: 1, fuse: 6 }), mine({ pr: 2, fuse: 1 })], 70)
  const step = cleanup(s)

  assert.deepEqual(step.fired, [], 'на уборке ничего не рвётся')
  assert.equal(step.shift.defects.find((d) => d.pr === 2)?.fuse, 1, 'фитиль соседа не тронут')
})

test('уборка разгребает только тихое: упавший прод чинят руками', () => {
  const s = withDefects([mine({ pr: 1, known: true, weight: 1 }), mine({ pr: 2, fuse: 6, weight: 4 })], 70)
  const after = cleanup(s).shift

  assert.deepEqual(
    after.defects.map((d) => d.pr),
    [1],
    'критическую уборкой не закрыть — иначе она перестаёт быть критической',
  )
})

test('уборка лечит и убирает самый лёгкий дефект', () => {
  // Здоровье заранее просажено: на потолке лечить нечего, и проверка
  // «стало лучше» ничего бы не значила.
  const dirty = withDefects([mine({ weight: 4, fuse: 6 }), mine({ pr: 1409, weight: 1, fuse: 6 })], 70)
  const after = cleanup(dirty).shift

  assert.equal(after.pr, dirty.pr, 'уборка не тратит номер PR')
  assert.ok(after.prod.health > dirty.prod.health)
  assert.deepEqual(
    after.defects.map((d) => d.weight),
    [4],
    'убран самый лёгкий, тяжёлый остался лежать',
  )
  assert.equal(after.prod.velocity, dirty.prod.velocity, 'уборка не трогает скорость')
  assert.equal(after.log.at(-1)?.kind, 'cleanup')
})

test('уборка в чистом проде — профилактика, заряд тратится', () => {
  const s = cleanup(start()).shift

  assert.equal(s.cleanups, CLEANUPS - 1)
  const last = s.log.at(-1)
  assert.ok(last?.kind === 'cleanup' && last.task === null && last.pr === null)
})

test('уборка называет PR, который закрыла', () => {
  // Это подсказка, и намеренная: заряд тратят в том числе ради неё.
  // Без номера в списке починки нечего пометить, и кнопка выглядит мёртвой.
  const s = withDefects([mine({ pr: 1409, weight: 1, fuse: 6 })], 70)
  const last = cleanup(s).shift.log.at(-1)

  assert.ok(last?.kind === 'cleanup' && last.pr === 1409)
})

test('ход не мутирует смену, из которой сделан', () => {
  const before = start()
  review(before, DIRTY, 'missed')
  cleanup(before)

  assert.equal(before.turn, 0)
  assert.deepEqual(before.defects, [])
  assert.deepEqual(before.log, [])
})

test('дельта здоровья за ход — единственная подсказка вслепую', () => {
  // Счётчик мин игроку не показывают, поэтому шаг здоровья должен быть
  // в состоянии смены: по нему игрок и оценивает, сколько у него в проде.
  const quiet = review(start(), CLEAN, 'clean-correct').shift
  assert.equal(quiet.delta, 0, 'пустой прод не течёт')

  const leaking = review(withDefects([mine({ fuse: 5, leak: 0.6 })]), CLEAN, 'clean-correct').shift
  assert.ok(leaking.delta < 0)
  assert.equal(leaking.delta, Math.round((leaking.prod.health - MAX_HEALTH) * 100) / 100)
})

test('починил своими руками — мины больше нет', () => {
  const before = withDefects([mine({ pr: 1411, known: true }), mine({ pr: 1409, fuse: 5 })], 70)
  const after = repair(before, 1411, DIRTY, 'found')

  assert.deepEqual(
    after.shift.defects.map((d) => d.pr),
    [1409],
  )
  assert.equal(after.result, 'cured')
  assert.ok(after.shift.prod.health > before.prod.health, 'починка возвращает часть здоровья')
})

test('не попал — мина осталась, и это стоило здоровья', () => {
  const before = withDefects([mine({ pr: 1411, known: true })], 70)
  const after = repair(before, 1411, DIRTY, 'missed')

  assert.equal(after.result, 'failed')
  assert.ok(after.shift.defects.some((d) => d.pr === 1411), 'мина на месте')
  assert.ok(after.shift.prod.health < before.prod.health)
})

test('полез в здоровый код — сломал его', () => {
  // Самая дорогая ошибка починки: PR был чистый, а игрок «поправил» строку.
  const before = withDefects([], 70)
  const after = repair(before, 1409, DIRTY, 'partial')

  assert.equal(after.result, 'broke')
  assert.equal(after.shift.defects.length, 1, 'в проде появилась новая мина')
  assert.equal(after.shift.defects[0].pr, 1409)
  assert.ok(after.shift.prod.health < before.prod.health)
})

test('починка не отнимает ход смены, но время в проде идёт', () => {
  // Ходы кончились — чинят уже после смены. А фитили тикают: пока возишься
  // с одним, дотикает другое.
  const before = withDefects([mine({ pr: 1411, known: true }), mine({ pr: 1409, fuse: 1 })], 70)
  const after = repair(before, 1411, DIRTY, 'found')

  assert.equal(after.shift.turn, before.turn, 'ход не тратится')
  assert.equal(after.fired.length, 1, 'соседний фитиль догорел, пока чинили')
})

test('починка попадает в журнал и вскрывается только в разборе', () => {
  const before = withDefects([mine({ pr: 1411, known: true })], 70)
  const after = repair(before, 1411, DIRTY, 'found').shift

  const last = after.log.at(-1)
  assert.ok(last?.kind === 'repair' && last.pr === 1411 && last.result === 'cured')
})

test('смена кончается, когда вышли ходы', () => {
  const short = start(undefined, 2)

  assert.equal(isShiftOver(short), false)
  assert.equal(isShiftOver(review(short, CLEAN, 'clean-correct').shift), false)
  assert.equal(isShiftOver(turns(short, 2)), true)
})

test('сгоревший прод обрывает смену досрочно', () => {
  let s = start(undefined, 40)
  // Пропускаем всё подряд: рано или поздно прод не выдержит.
  for (let i = 0; i < 40 && !isShiftOver(s); i++) s = review(s, DIRTY, 'missed').shift

  assert.equal(isShiftOver(s), true)
  assert.ok(s.turn < 40, 'смена оборвалась раньше, чем вышли ходы')
  assert.equal(finish(s).verdict, 'burned')
})

test('перестраховщика снимают с ревью', () => {
  let s = start(undefined, 40)
  for (let i = 0; i < 40 && !isShiftOver(s); i++) s = review(s, CLEAN, 'false-accusation').shift

  assert.equal(finish(s).verdict, 'fired')
  assert.equal(finish(s).debt, 0, 'прод при этом чист — и в этом вся ирония')
})

test('сводка считает долг из того, что осталось в проде', () => {
  const s = review(review(start(), DIRTY, 'missed').shift, DIRTY, 'partial').shift
  const summary = finish(s)

  assert.equal(summary.defects, s.defects.length)
  assert.equal(summary.debt, debt(s.defects))
  assert.equal(summary.verdict, 'alive')
})

test('в подозреваемые идут только смёрженные, новые первыми', () => {
  let s = start()
  s = review(s, DIRTY, 'missed').shift // смёржен
  s = review(s, DIRTY, 'found').shift // заблокирован
  s = review(s, CLEAN, 'clean-correct').shift // смёржен

  const last = merged(s, 4)

  assert.equal(last.length, 2)
  assert.ok(last.every((e) => e.kind === 'merged'))
  assert.ok(last[0].turn > last[1].turn, 'новые первыми')
})

test('подозреваемых отдаём не больше, чем просили', () => {
  let s = start()
  for (let i = 0; i < 6; i++) s = review(s, DIRTY, 'missed').shift

  assert.equal(merged(s, 4).length, 4)
})

test('смена переживает перезагрузку вкладки', () => {
  const s = review(start(), DIRTY, 'missed').shift
  const back = restore(JSON.parse(JSON.stringify(s)))

  assert.deepEqual(back, s)
})

test('смена с починкой и уборкой тоже переживает перезагрузку', () => {
  // Событие в журнале, о котором проверка не знает, роняет всю смену молча:
  // игрок возвращается и обнаруживает, что прода нет вообще.
  const played = review(start(), DIRTY, 'missed').shift
  const fixed = repair(cleanup(played).shift, played.pr, DIRTY, 'found').shift

  assert.ok(
    fixed.log.some((e) => e.kind === 'repair') && fixed.log.some((e) => e.kind === 'cleanup'),
    'в журнале должны быть оба события',
  )
  assert.deepEqual(restore(JSON.parse(JSON.stringify(fixed))), fixed)
})

test('мусор вместо смены выбрасывается молча', () => {
  for (const junk of [null, undefined, 0, 'смена', {}, { turn: 1 }, { turn: 'два', turns: 14 }]) {
    assert.equal(restore(junk), null, `${JSON.stringify(junk)} не смена`)
  }
})


test('смена — это рабочий день, и дни считаются', () => {
  const first = start()
  assert.equal(first.day, 1)
  assert.equal(first.turns, 12)

  const second = start(carry(first))
  assert.equal(second.day, 2)
})

test('чекпойнт — каждые четыре хода, но не на старте', () => {
  let s = start()
  assert.equal(isCheckpoint(s), false)

  const seen: number[] = []
  for (let i = 0; i < SHIFT_TURNS; i++) {
    s = review(s, CLEAN, 'clean-correct').shift
    if (isCheckpoint(s)) seen.push(s.turn)
  }

  assert.deepEqual(seen, [4, 8, 12])
})

test('слежка тратит ход, но не мёржит PR', () => {
  const before = start()
  const after = watch(before, DIRTY, [DIRTY.bugs[0].line], true).shift

  assert.equal(after.turn, before.turn + 1)
  // Номер PR тот же: пул-реквест вернётся следующим ходом.
  assert.equal(after.pr, before.pr)
  assert.equal(after.defects.length, 0, 'на логировании мина в прод не уезжает')
  assert.equal(after.pending?.pr, before.pr)
  assert.ok(after.log.some((e) => e.kind === 'watch'))
})

test('удачная слежка не стоит здоровья, промах — трети', () => {
  const hit = watch(start(), DIRTY, [DIRTY.bugs[0].line], true).shift
  assert.equal(hit.prod.health, MAX_HEALTH)

  const miss = watch(start(), DIRTY, [1], false).shift
  assert.ok(miss.prod.health < MAX_HEALTH, 'промах должен что-то стоить')

  // Пропуск того же PR обходится дороже — ради этого слежку и ставят.
  const missed = review(start(), DIRTY, 'missed')
  let s = missed.shift
  while (s.defects.some((d) => !d.known)) s = review(s, CLEAN, 'clean-correct').shift

  assert.ok(
    MAX_HEALTH - miss.prod.health < MAX_HEALTH - s.prod.health,
    'слежка должна быть дешевле пропуска',
  )
})

test('слежка за чистым PR ничего не стоит', () => {
  const s = watch(start(), CLEAN, [1, 2], false).shift
  assert.equal(s.prod.health, MAX_HEALTH)
})

test('решение по PR снимает его с логирования', () => {
  const watched = watch(start(), DIRTY, [1], false).shift
  const decided = review(watched, DIRTY, 'found').shift

  assert.equal(decided.pending, null)
})

test('смена со слежкой переживает перезагрузку', () => {
  const s = watch(start(), DIRTY, [DIRTY.bugs[0].line], true).shift
  assert.deepEqual(restore(JSON.parse(JSON.stringify(s))), s)
})

test('запросы к терминалу — ограниченный ресурс смены', () => {
  let s = start()
  assert.equal(s.probes, PROBES)

  for (let i = 0; i < PROBES; i++) s = probe(s)
  assert.equal(s.probes, 0)

  // В минус не уходим: терминал сам откажет, но движок не должен позволять и подавно.
  assert.equal(probe(s).probes, 0)
})

test('заряды терминала не переносятся в следующую смену', () => {
  const spent = probe(probe(start()))
  assert.equal(start(carry(spent)).probes, PROBES)
})

test('секундомер копит время смены, но ни на что не влияет', () => {
  const fast = review(start(), CLEAN, 'clean-correct', 12)
  const slow = review(start(), CLEAN, 'clean-correct', 120)

  assert.equal(fast.shift.spent, 12)
  assert.equal(slow.shift.spent, 120)
  // Здоровье и скорость от времени не зависят: в смене важнее качество.
  assert.deepEqual(fast.shift.prod, slow.shift.prod)
})

test('время копится и на слежке', () => {
  const s = watch(start(), DIRTY, [DIRTY.bugs[0].line], true, 30).shift
  assert.equal(s.spent, 30)
})
