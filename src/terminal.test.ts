/**
 * Спецификация терминала.
 *
 * Терминал — это подсказка, а не ответ. Половина тестов здесь именно про
 * это: команда обязана дать зацепку и обязана не назвать строку с подлянкой.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AGENTS } from './agents.ts'
import { caught, COST, report, run, type TerminalContext } from './terminal.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

const DIRTY = PACK.find((t) => !t.clean && t.bugs.length === 1)!
const CLEAN = PACK.find((t) => t.clean)!

function ctx(over: Partial<TerminalContext> = {}): TerminalContext {
  return {
    task: DIRTY,
    pr: 1408,
    author: AGENTS.commander,
    dossier: {},
    selected: [],
    watching: [],
    ...over,
  }
}

const text = (task: Task, input: string, over: Partial<TerminalContext> = {}) =>
  run(input, ctx({ task, ...over }))
    .lines.map((l) => l.text)
    .join('\n')

test('help перечисляет команды и не стоит времени', () => {
  const result = run('help', ctx())
  assert.ok(result.lines.some((l) => l.text.includes('/git-blame')))
  assert.equal(result.effects.length, 0)
})

test('слэш перед командой необязателен', () => {
  assert.deepEqual(run('/help', ctx()).lines, run('help', ctx()).lines)
})

test('незнакомая команда не молчит', () => {
  const result = run('sudo rm -rf', ctx())
  assert.ok(result.lines[0].text.includes('не найдена'))
  assert.equal(result.effects.length, 0)
})

test('git-blame показывает строку, автора и стоит времени', () => {
  const line = DIRTY.bugs[0].line
  const result = run(`git-blame ${line}`, ctx())

  assert.ok(result.lines.some((l) => l.text.includes('Commander')))
  assert.deepEqual(result.effects[0], { kind: 'time', seconds: COST.blame })
  assert.deepEqual(result.effects[1], { kind: 'dossier', agent: 'commander' })
})

test('git-blame открывает досье по строке за вызов', () => {
  const line = DIRTY.bugs[0].line
  const first = text(DIRTY, `git-blame ${line}`)
  const later = text(DIRTY, `git-blame ${line}`, { dossier: { commander: 3 } })

  const count = (s: string) => s.split('\n').filter((l) => l.startsWith('  — ')).length
  assert.equal(count(first), 1)
  assert.equal(count(later), 4)
  assert.ok(later.includes('полностью'))
})

test('git-blame на несуществующей строке отвечает отказом', () => {
  const result = run('git-blame 9999', ctx())
  assert.ok(result.lines[0].text.includes('нет'))
  assert.equal(result.effects.length, 0)
})

test('git-blame без номера не тратит время', () => {
  assert.equal(run('git-blame', ctx()).effects.length, 0)
})

test('compare-with-blueprint называет район, но не строку', () => {
  for (const task of PACK.filter((t) => t.bugs.length === 1).slice(0, 40)) {
    const result = run('compare-with-blueprint', ctx({ task }))
    const found = /строки (\d+)–(\d+)/.exec(result.lines.map((l) => l.text).join('\n'))

    assert.ok(found, `${task.id}: район не назван`)
    const [from, to] = [Number(found[1]), Number(found[2])]
    assert.ok(to > from, `${task.id}: район в одну строку — это адрес, а не район`)
    assert.ok(
      from <= task.bugs[0].line && task.bugs[0].line <= to,
      `${task.id}: подлянка вне названного района`,
    )
  }
})

test('на чистом PR blueprint тоже находит деформацию', () => {
  // Иначе «эталон не нашёл отклонений» = «здесь чисто», и чистые раунды
  // перестают работать: см. заметку «Чистые раунды обязательны».
  const result = run('compare-with-blueprint', ctx({ task: CLEAN }))
  assert.ok(result.lines.some((l) => l.text.includes('строки')))
})

test('deploy --dry-run зелёный только на точном попадании', () => {
  const good = run('deploy --dry-run', ctx({ selected: DIRTY.bugs.map((b) => b.line) }))
  assert.ok(good.lines.some((l) => l.tone === 'good'))

  const bad = run('deploy --dry-run', ctx({ selected: [DIRTY.bugs[0].line, 1] }))
  assert.ok(bad.lines.some((l) => l.text.includes('Ошибка компиляции')))
})

test('deploy --dry-run на чистом PR всегда красный', () => {
  const lines = [...new Set(CLEAN.decoys.map((d) => d.line))]
  const result = run('deploy --dry-run', ctx({ task: CLEAN, selected: lines }))
  assert.ok(result.lines.some((l) => l.text.includes('Ошибка компиляции')))
})

test('deploy без --dry-run прод не катит', () => {
  const result = run('deploy', ctx({ selected: [1] }))
  assert.equal(result.effects.length, 0)
  assert.ok(result.lines[0].text.includes('нельзя'))
})

test('deploy без отмеченных строк не тратит время', () => {
  assert.equal(run('deploy --dry-run', ctx()).effects.length, 0)
})

test('grab-evidence принимает и пробелы, и запятые', () => {
  const a = run('grab-evidence --on-line 12 13', ctx({ task: DIRTY }))
  const b = run('grab-evidence --on-line=13,12', ctx({ task: DIRTY }))
  assert.deepEqual(a.effects, b.effects)
})

test('слежка ставится один раз за ход', () => {
  const result = run('grab-evidence --on-line 12', ctx({ watching: [12] }))
  assert.equal(result.effects.length, 0)
  assert.ok(result.lines[0].text.includes('уже'))
})

test('отчёт по слежке подтверждает диапазон только при попадании', () => {
  const line = DIRTY.bugs[0].line
  assert.equal(caught(DIRTY, [line]), true)

  const hit = report(DIRTY, [line])
    .map((l) => l.text)
    .join('\n')
  assert.ok(hit.includes('аномалию'))
  assert.ok(hit.includes(String(line)))

  const miss = report(CLEAN, [1, 2])
    .map((l) => l.text)
    .join('\n')
  assert.ok(miss.includes('Аномалий не обнаружено') || miss.includes('аномалий не обнаружено'))
})

test('на чистом PR слежка никогда не срабатывает', () => {
  assert.equal(caught(CLEAN, [1, 2, 3, 4, 5]), false)
})
