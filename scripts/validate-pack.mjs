/**
 * Валидация пака задач. Использует тот же парсер, что и игра,
 * поэтому «строка 16» здесь и «строка 16» в бою — это одна и та же строка.
 *
 *   node scripts/validate-pack.mjs
 */
import { readFileSync } from 'node:fs'
import { parseDiff } from '../src/diff.ts'

const pack = JSON.parse(readFileSync(new URL('../src/content/pack.json', import.meta.url), 'utf8'))

const errors = []
const warnings = []
const ids = new Set()

for (const t of pack) {
  const at = (msg) => errors.push(`${t.id}: ${msg}`)

  if (ids.has(t.id)) at('дубликат id')
  ids.add(t.id)

  if (!/^(js|py|sql)-/.test(t.id)) at(`id должен начинаться со стека: ${t.id}`)
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
  if (/FAIL|✗|failed|Error/i.test(t.tests)) at('прогон должен быть зелёным')
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

const show = (l, label) => l.forEach((m) => console.log(`${label} ${m}`))
show(warnings, '⚠ ')
show(errors, '✗ ')

if (errors.length) {
  console.log(`\n${errors.length} ошибок в паке из ${pack.length} задач`)
  process.exit(1)
}
console.log(`\n✓ пак валиден: ${pack.length} задач, ${warnings.length} предупреждений`)
