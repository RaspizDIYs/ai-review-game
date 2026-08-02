/**
 * Валидация пака задач. Использует тот же парсер, что и игра,
 * поэтому «строка 16» здесь и «строка 16» в бою — это одна и та же строка.
 *
 *   node scripts/validate-pack.mjs
 */
import { readFileSync } from 'node:fs'
import { parseDiff } from '../src/diff.ts'
import { LANG } from './highlight.mjs'

const STACKS = Object.keys(LANG)
const ID_PREFIX = new RegExp(`^(${STACKS.join('|')})-`)

/**
 * Признаки красного прогона. Ищем именно провалившиеся тесты, а не слово
 * «failed»: зелёный отчёт .NET, JUnit и cargo сам печатает «Failures: 0»
 * и «0 failed» — на этом простая проверка на подстроку и ломалась.
 */
const RED = [
  /\bFAIL(ED|URE)?\b/, // прописными — так их печатают go test, vitest, pytest
  /✗/,
  /\b[1-9]\d*\s+(failure|error|failed)/i, // «3 failures», «2 errors»
  /(failures?|errors?|failed)\s*[:=]\s*[1-9]/i, // «Failures: 2», «Failed: 1»
  /Traceback|panicked at|Unhandled exception/i,
]

const pack = JSON.parse(readFileSync(new URL('../src/content/pack.json', import.meta.url), 'utf8'))

const errors = []
const warnings = []
const ids = new Set()

for (const t of pack) {
  const at = (msg) => errors.push(`${t.id}: ${msg}`)

  if (ids.has(t.id)) at('дубликат id')
  ids.add(t.id)

  if (!ID_PREFIX.test(t.id)) at(`id должен начинаться со стека: ${t.id}`)
  if (!STACKS.includes(t.stack)) at(`неизвестный стек: ${t.stack}`)
  if (!t.id.startsWith(`${t.stack}-`)) at(`id не совпадает со стеком ${t.stack}`)
  if (t.difficulty < 1 || t.difficulty > 5) at(`difficulty вне 1..5: ${t.difficulty}`)

  const lines = parseDiff(t.diff)
  const clickable = new Map(lines.filter((l) => l.newNo !== null).map((l) => [l.newNo, l]))

  if (t.clean) {
    if (t.bugs.length) at('clean, но bugs не пуст')
    if (!t.decoys.length) at('clean без обманок — это не раунд, а пауза')
  } else if (!t.bugs.length) {
    at('не clean, но подлянок нет')
  }

  for (const bug of t.bugs) {
    const line = clickable.get(bug.line)
    if (!line) {
      at(`bug.line ${bug.line} не существует в новой версии файла`)
      continue
    }
    if (!bug.explain || !bug.consequence) at(`bug на ${bug.line} без explain/consequence`)
    if (bug.consequence && bug.consequence.length < 60)
      warnings.push(`${t.id}: consequence на ${bug.line} короткий — «будут проблемы» не годится`)
    if (!['missing', 'wrong'].includes(bug.kind)) at(`bug.kind неизвестен: ${bug.kind}`)
  }

  for (const d of t.decoys) {
    const line = clickable.get(d.line)
    if (!line) at(`decoy.line ${d.line} не существует в новой версии файла`)
    if (t.bugs.some((b) => b.line === d.line)) at(`decoy ${d.line} совпадает с подлянкой`)
  }

  // Заготовка от new-task.mjs не должна доехать до игры незамеченной.
  const draft = JSON.stringify(t).includes('TODO')
  if (draft) at('задача не дописана — в ней остались TODO')

  if (!t.tests.trim()) at('пустой прогон тестов')
  if (RED.some((re) => re.test(t.tests))) at('прогон должен быть зелёным')
  if (!t.verified_by || t.verified_by === '—')
    warnings.push(`${t.id}: не проверена вторым человеком`)
}

// Дневная серия берёт по одной задаче нужной сложности из своей колоды,
// поэтому короткая колода = задача возвращается через считаные дни.
// Это самое незаметное следствие роста пака: тесты зелёные, а игроку скучно.
const PLAN = [1, 2, 3, 3, 4]
for (const difficulty of [...new Set(PLAN)]) {
  const slots = PLAN.filter((d) => d === difficulty).length
  const size = pack.filter((t) => t.difficulty === difficulty && !t.clean).length
  const cycle = Math.floor(size / slots)

  if (size === 0) {
    warnings.push(`сложность ${difficulty}: ни одной задачи, слот заполнится соседней`)
  } else if (cycle < 7) {
    warnings.push(
      `сложность ${difficulty}: всего ${size} задач на ${slots} слот(а) — ` +
        `колода прокручивается за ${cycle} дн., игрок увидит повтор на этой неделе`,
    )
  }
}

// Своя подборка — три задачи под выбранный уровень и один язык. Если задач
// нужной сложности меньше трёх, подборка молча становится короче: играть можно,
// но обещание «три задачи» ломается. Растить пак стоит по этому списку.
const SET_SIZE = 3
const LEVEL_CAP = { Стажёр: 2, Джун: 3, Мидл: 4, Сеньор: 5 }

for (const stack of STACKS) {
  const own = pack.filter((t) => t.stack === stack)
  if (own.length === 0) {
    warnings.push(`${stack}: задач нет вовсе — в списке языков будет прочерк`)
    continue
  }

  for (const [name, cap] of Object.entries(LEVEL_CAP)) {
    const fit = own.filter((t) => t.difficulty <= cap).length
    if (fit < SET_SIZE) {
      warnings.push(
        `${stack}, уровень «${name}»: задач до сложности ${cap} всего ${fit} — ` +
          `подборка на одном этом языке будет короче трёх`,
      )
    }
  }
}

const show = (l, label) => l.forEach((m) => console.log(`${label} ${m}`))
show(warnings, '⚠ ')
show(errors, '✗ ')

if (errors.length) {
  console.log(`\n${errors.length} ошибок в паке из ${pack.length} задач`)
  process.exit(1)
}
console.log(`\n✓ пак валиден: ${pack.length} задач, ${warnings.length} предупреждений`)
