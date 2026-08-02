/**
 * Сборка пака из авторских файлов.
 *
 *   content/tasks/<id>.json   — что пишет человек: подлянка указана куском кода
 *   src/content/pack.json     — что читает игра: подлянка указана номером строки
 *
 * Ради этого шага всё и затевалось: руками проставлять номера строк для тридцати
 * задач невозможно — они разъезжаются от любой правки дифа и молча указывают
 * не туда. Кусок кода переживает правки, а если стал неоднозначным — сборка падает.
 *
 *   node scripts/build-pack.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseDiff } from '../src/diff.ts'
import { highlightPack } from './highlight.mjs'

const SRC = new URL('../content/tasks/', import.meta.url)
const OUT = new URL('../src/content/pack.json', import.meta.url)

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

if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`)
  console.log(`\n${errors.length} ошибок, пак не собран`)
  process.exit(1)
}

const pack = await highlightPack(built)
writeFileSync(OUT, JSON.stringify(pack, null, 2) + '\n')

const byStack = built.reduce((acc, t) => ({ ...acc, [t.stack]: (acc[t.stack] ?? 0) + 1 }), {})
const clean = built.filter((t) => t.clean).length
console.log(
  `✓ пак собран: ${built.length} задач ` +
    `(${Object.entries(byStack).map(([k, v]) => `${k} ${v}`).join(', ')}), ` +
    `из них чистых ${clean}`,
)
