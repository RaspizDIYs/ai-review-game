/**
 * Сборка пака из авторских файлов.
 *
 *   content/tasks/<id>.json      — что пишет человек: подлянка указана куском кода
 *   src/content/pack.json        — что читает игра: подлянка указана номером строки
 *   src/content/tokens/<id>.json — подсветка, отдельным файлом на задачу
 *
 * Ради этого шага всё и затевалось: руками проставлять номера строк для тридцати
 * задач невозможно — они разъезжаются от любой правки дифа и молча указывают
 * не туда. Кусок кода переживает правки, а если стал неоднозначным — сборка падает.
 *
 *   node scripts/build-pack.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { parseDiff } from '../src/diff.ts'
import { highlightPack } from './highlight.mjs'

const SRC = new URL('../content/tasks/', import.meta.url)
const OUT = new URL('../src/content/pack.json', import.meta.url)
const TOKENS = new URL('../src/content/tokens/', import.meta.url)
const REASONS_SRC = new URL('../content/reasons.json', import.meta.url)
const REASONS_OUT = new URL('../src/content/reasons.json', import.meta.url)

const errors = []

function resolve(task, diffLines, match, what) {
  const hits = diffLines.filter((l) => l.newNo !== null && l.text.includes(match))

  if (hits.length === 0) {
    errors.push(`${task.id}: ${what} — не нашёл строку с «${match}»`)
    return null
  }
  if (hits.length > 1) {
    errors.push(
      `${task.id}: ${what} — «${match}» встречается ${hits.length} раз ` +
        `(строки ${hits.map((h) => h.newNo).join(', ')}), уточни фрагмент`,
    )
    return null
  }
  return hits[0].newNo
}

const built = []

for (const name of readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  const task = JSON.parse(readFileSync(new URL(name, SRC), 'utf8'))

  if (`${task.id}.json` !== name) {
    errors.push(`${name}: имя файла не совпадает с id «${task.id}»`)
  }

  const diffLines = parseDiff(task.diff)

  built.push({
    ...task,
    bugs: task.bugs.map((b) => {
      const { match, ...rest } = b
      return { ...rest, line: resolve(task, diffLines, match, `подлянка`) }
    }),
    decoys: task.decoys.map((d) => {
      const { match, ...rest } = d
      return { ...rest, line: resolve(task, diffLines, match, `обманка`) }
    }),
  })
}

// Формулировки для шага «почему». Тег без формулировки — это раунд, на котором
// игроку нечего выбрать, поэтому проверяем здесь, а не в игре.
const reasons = JSON.parse(readFileSync(REASONS_SRC, 'utf8'))
const usedTags = new Set(built.flatMap((t) => t.bugs.map((b) => b.tag)))

for (const tag of usedTags) {
  if (!reasons[tag]) errors.push(`нет формулировки для тега «${tag}» в content/reasons.json`)
}

if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`)
  console.log(`\n${errors.length} ошибок, пак не собран`)
  process.exit(1)
}

writeFileSync(REASONS_OUT, JSON.stringify(reasons, null, 2) + '\n')

// Подсветка — три четверти веса пака, а нужна она только для той задачи,
// которая сейчас на экране. Поэтому в pack.json её нет: он грузится целиком
// (по нему выбирается серия), а токены подтягиваются по одной задаче.
const highlighted = await highlightPack(built)

rmSync(TOKENS, { recursive: true, force: true })
mkdirSync(TOKENS, { recursive: true })

for (const task of highlighted) {
  writeFileSync(new URL(`${task.id}.json`, TOKENS), JSON.stringify(task.tokens))
}

const pack = highlighted.map(({ tokens: _tokens, ...task }) => task)
writeFileSync(OUT, JSON.stringify(pack, null, 2) + '\n')

const byStack = built.reduce((acc, t) => ({ ...acc, [t.stack]: (acc[t.stack] ?? 0) + 1 }), {})
const clean = built.filter((t) => t.clean).length
console.log(
  `✓ пак собран: ${built.length} задач ` +
    `(${Object.entries(byStack).map(([k, v]) => `${k} ${v}`).join(', ')}), ` +
    `из них чистых ${clean}`,
)
