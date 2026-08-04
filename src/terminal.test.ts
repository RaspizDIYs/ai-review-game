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
import { caught, enclosing, report, run, type TerminalContext } from './terminal.ts'
import { PROBES } from './shift.ts'
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
    probes: PROBES,
    blamed: false,
    ...over,
  }
}

const text = (task: Task, input: string, over: Partial<TerminalContext> = {}) =>
  run(input, ctx({ task, ...over }))
    .lines.map((l) => l.text)
    .join('\n')

test('help перечисляет команды и не тратит запрос', () => {
  const result = run('help', ctx())
  assert.ok(result.lines.some((l) => l.text.includes('/git-blame')))
  assert.equal(result.effects.length, 0)
})

test('слэш перед командой необязателен', () => {
  assert.deepEqual(run('/help', ctx()).lines, run('help', ctx()).lines)
})

test('незнакомая команда не молчит и ничего не стоит', () => {
  const result = run('sudo rm -rf', ctx())
  assert.ok(result.lines[0].text.includes('не найдена'))
  assert.equal(result.effects.length, 0)
})

test('git-blame показывает строку, автора и тратит запрос', () => {
  const line = DIRTY.bugs[0].line
  const result = run(`git-blame ${line}`, ctx())

  assert.ok(result.lines.some((l) => l.text.includes('Commander')))
  assert.deepEqual(result.effects[0], { kind: 'probe' })
  assert.deepEqual(result.effects[1], { kind: 'dossier', agent: 'commander' })
})

test('история поднимается раз за ход', () => {
  // Иначе весь профиль агента открывается за один раунд, и «постепенно»
  // из постановки не работает вовсе.
  const result = run(`git-blame ${DIRTY.bugs[0].line}`, ctx({ blamed: true }))
  assert.equal(result.effects.length, 0)
  assert.ok(result.lines[0].text.includes('уже поднята'))
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

test('git-blame без номера не тратит запрос', () => {
  assert.equal(run('git-blame', ctx()).effects.length, 0)
})

test('кончились запросы — терминал не отвечает ничем платным', () => {
  const empty = ctx({ probes: 0 })

  for (const command of ['git-blame 5', 'compare-with-blueprint', 'deploy --dry-run']) {
    const result = run(command, empty)
    assert.equal(result.effects.length, 0, command)
    assert.ok(result.lines[0].text.includes('запросов'), command)
  }

  // help, clear и слежка запросов не тратят и работать не перестают.
  assert.ok(run('help', empty).lines.length > 0)
  assert.deepEqual(run('clear', empty).effects, [{ kind: 'clear' }])
  const line = DIRTY.bugs[0].line
  assert.deepEqual(run(`grab-evidence --on-line ${line}`, empty).effects, [
    { kind: 'watch', lines: [line] },
  ])
})

test('compare-with-blueprint не называет ни одной строки', () => {
  // Раньше команда выдавала район в семь строк — это фактически адрес,
  // и она решала задачу за игрока.
  for (const task of PACK.slice(0, 60)) {
    const said = text(task, 'compare-with-blueprint')
    assert.ok(!/строк[аиуе]?\s*\d/i.test(said), `${task.id}: терминал назвал строку`)
    assert.ok(!new RegExp(`\\b${task.bugs[0]?.line ?? -1}\\b`).test(said), `${task.id}: номер утёк`)
  }
})

test('compare-with-blueprint называет место в коде, а не файл целиком', () => {
  const named = PACK.filter((t) => t.bugs.length > 0).filter((task) => {
    const where = enclosing(task, task.bugs[0].line)
    return where !== '' && !where.includes('/')
  })

  // Не у каждой задачи есть объявление выше подлянки — например, у yaml
  // и голых скриптов. Но у большинства есть, иначе команда пустая.
  assert.ok(
    named.length / PACK.filter((t) => t.bugs.length > 0).length > 0.7,
    `место в коде названо только у ${named.length} задач`,
  )
})

test('на чистом PR blueprint тоже находит деформацию', () => {
  // Иначе «эталон не нашёл отклонений» = «здесь чисто», и чистые раунды
  // перестают работать: см. заметку «Чистые раунды обязательны».
  const result = run('compare-with-blueprint', ctx({ task: CLEAN }))
  assert.ok(result.lines.some((l) => l.text.includes('деформ') || l.text.includes('расхождение')))
  assert.deepEqual(result.effects, [{ kind: 'probe' }])
})

test('deploy --dry-run зелёный только на точном попадании', () => {
  const good = run('deploy --dry-run', ctx({ selected: DIRTY.bugs.map((b) => b.line) }))
  assert.ok(good.lines.some((l) => l.tone === 'good'))

  const bad = run('deploy --dry-run', ctx({ selected: [DIRTY.bugs[0].line, 1] }))
  assert.ok(bad.lines.some((l) => l.text.includes('Ошибка компиляции')))
})

test('deploy --dry-run отвечает числом, а не лампочкой', () => {
  // Раньше любой промах давал одни и те же 23%, и команда сводилась к «да/нет».
  const percent = (selected: number[]) => {
    const said = text(DIRTY, 'deploy --dry-run', { selected })
    return Number(/(\d+)%/.exec(said)![1])
  }

  const bug = DIRTY.bugs[0].line
  const spare = [...Array(40).keys()].map((i) => i + 1).filter((n) => n !== bug)

  const near = percent([bug, spare[0]])
  const far = percent([bug, spare[0], spare[1], spare[2]])
  const nothing = percent([spare[0]])

  assert.ok(near > far, 'одна лишняя строка должна стоить меньше трёх')
  assert.ok(near > nothing, 'найденная подлянка должна что-то значить')
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

test('deploy без отмеченных строк не тратит запрос', () => {
  assert.equal(run('deploy --dry-run', ctx()).effects.length, 0)
})

test('grab-evidence принимает и пробелы, и запятые', () => {
  const a = run('grab-evidence --on-line 12 13', ctx({ task: DIRTY }))
  const b = run('grab-evidence --on-line=13,12', ctx({ task: DIRTY }))
  assert.deepEqual(a.effects, b.effects)
})

test('слежка не тратит запрос — она тратит ход', () => {
  const result = run('grab-evidence --on-line 12', ctx())
  assert.deepEqual(result.effects, [{ kind: 'watch', lines: [12] }])
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
  assert.ok(miss.toLowerCase().includes('аномалий не обнаружено'))
})

test('на чистом PR слежка никогда не срабатывает', () => {
  assert.equal(caught(CLEAN, [1, 2, 3, 4, 5]), false)
})
