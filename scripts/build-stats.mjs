/**
 * Считает агрегат из лога событий в статический stats.json, который читает игра.
 *
 * Запускается по cron на сервере рядом с приёмником. Никакого приложения:
 * лог → JSON → тот же nginx его и отдаёт. Ровно та же логика, что в metrics.mjs,
 * только вывод машинный.
 *
 *   node scripts/build-stats.mjs <events.log> <stats.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [logPath, outPath] = process.argv.slice(2)
if (!logPath || !outPath) {
  console.error('node scripts/build-stats.mjs <events.log> <stats.json>')
  process.exit(1)
}

/** Меньше этого — не показываем: проценты на трёх игроках только вводят в заблуждение. */
const MIN_SAMPLE = 5

const tasks = new Map()
const dailyScores = []

for (const line of readFileSync(logPath, 'utf8').split('\n')) {
  const at = line.indexOf(' ')
  if (at === -1) continue

  const p = Object.fromEntries(new URLSearchParams(line.slice(at + 1)))

  if (p.e === 'round' && p.t) {
    const s = tasks.get(p.t) ?? { shown: 0, found: 0 }
    s.shown++
    if (p.o === 'found' || p.o === 'clean-correct') s.found++
    tasks.set(p.t, s)
  } else if (p.e === 'series' && p.m === 'daily' && p.n) {
    dailyScores.push(Number(p.w) / Number(p.n))
  }
}

const out = { tasks: {}, dailyWinShares: [] }

for (const [id, s] of tasks) {
  if (s.shown < MIN_SAMPLE) continue
  out.tasks[id] = { n: s.shown, found: Math.round((s.found / s.shown) * 100) }
}

// Распределение долей угаданного за все дни — по нему считается «лучше, чем у N%».
if (dailyScores.length >= MIN_SAMPLE) {
  out.dailyWinShares = dailyScores.sort((a, b) => a - b).map((x) => Math.round(x * 100))
}

writeFileSync(outPath, JSON.stringify(out))
console.log(
  `stats.json: задач с данными ${Object.keys(out.tasks).length}, серий ${out.dailyWinShares.length}`,
)
