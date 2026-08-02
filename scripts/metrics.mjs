/**
 * Отчёт по метрикам: какая задача как решается.
 *
 *   HOST=myserver node scripts/metrics.mjs          # забрать лог с сервера
 *   node scripts/metrics.mjs path/to/events.log     # из файла
 *
 * Главная колонка — «нашли». Из-за неё всё и затевалось: сложность у задач
 * проставлена автором на глаз, и это единственный способ узнать, угадал он или нет.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const REMOTE_LOG = '/root/review-metrics/log/events.log'

/** Ниже этого числа показов проценты — шум, а не данные. */
const MIN_SAMPLE = 5

function load() {
  const file = process.argv[2]
  if (file) return readFileSync(file, 'utf8')

  const host = process.env.HOST
  if (!host) {
    console.error('укажи HOST=myserver или путь к логу файлом')
    process.exit(1)
  }
  return execFileSync('ssh', [host, `cat ${REMOTE_LOG}`], { encoding: 'utf8' })
}

const rounds = []
const series = []
let opens = 0

for (const line of load().split('\n')) {
  const at = line.indexOf(' ')
  if (at === -1) continue

  const p = Object.fromEntries(new URLSearchParams(line.slice(at + 1)))
  if (p.e === 'open') opens++
  else if (p.e === 'round') rounds.push(p)
  else if (p.e === 'series') series.push(p)
}

const pack = JSON.parse(
  readFileSync(new URL('../src/content/pack.json', import.meta.url), 'utf8'),
)
const byId = new Map(pack.map((t) => [t.id, t]))

const stats = new Map()
for (const r of rounds) {
  const s = stats.get(r.t) ?? { shown: 0, found: 0, missed: 0, falseAcc: 0, seconds: [] }
  s.shown++
  if (r.o === 'found' || r.o === 'clean-correct') s.found++
  else if (r.o === 'false-accusation') s.falseAcc++
  else s.missed++
  s.seconds.push(Number(r.s))
  stats.set(r.t, s)
}

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0
}
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0)

console.log(`\nОткрытий: ${opens}   раундов: ${rounds.length}   серий: ${series.length}`)

if (series.length) {
  const daily = series.filter((s) => s.m === 'daily')
  if (daily.length) {
    const avgWins =
      daily.reduce((acc, s) => acc + Number(s.w) / Number(s.n || 1), 0) / daily.length
    console.log(
      `Доходят до конца дневной серии: ${daily.length} из ${opens} открытий ` +
        `(${pct(daily.length, opens)}%), в среднем угадывают ${Math.round(avgWins * 100)}%`,
    )
  }
}

const rows = [...stats.entries()]
  .map(([id, s]) => ({
    id,
    task: byId.get(id),
    ...s,
    foundPct: pct(s.found, s.shown),
    falsePct: pct(s.falseAcc, s.shown),
    med: median(s.seconds),
  }))
  .sort((a, b) => a.foundPct - b.foundPct)

if (!rows.length) {
  console.log('\nПо задачам данных пока нет.\n')
  process.exit(0)
}

console.log('\nЗадачи, от самых трудных к самым лёгким:\n')
console.log('  слож  показов  нашли  обвинили  медиана  задача')

for (const r of rows) {
  const d = r.task ? r.task.difficulty : '?'
  const thin = r.shown < MIN_SAMPLE ? ' ·' : '  '
  console.log(
    `  ${String(d).padStart(4)}${String(r.shown).padStart(9)}${thin}` +
      `${String(r.foundPct + '%').padStart(6)}` +
      `${String(r.falsePct + '%').padStart(10)}` +
      `${String(r.med + 'с').padStart(9)}  ${r.id}`,
  )
}

console.log(`\n  · — меньше ${MIN_SAMPLE} показов, проценты пока ничего не значат\n`)

// Выводы, ради которых отчёт и читают.
const enough = rows.filter((r) => r.shown >= MIN_SAMPLE)
const tooHard = enough.filter((r) => r.foundPct < 20)
const tooEasy = enough.filter((r) => r.foundPct > 80 && r.med < 15)
const badDecoy = enough.filter((r) => r.task && !r.task.clean && r.falsePct > 30)

const report = (list, title, hint) => {
  if (!list.length) return
  console.log(`${title}`)
  for (const r of list) console.log(`  ${r.id} — ${hint(r)}`)
  console.log()
}

report(tooHard, 'Слишком сложные — переписать или поднять сложность:', (r) => `нашли ${r.foundPct}%`)
report(tooEasy, 'Слишком лёгкие — понизить сложность или выкинуть:', (r) => `нашли ${r.foundPct}% за ${r.med}с`)
report(
  badDecoy,
  'Обманка сильнее подлянки — игроки жмут «здесь чисто» на грязной задаче:',
  (r) => `${r.falsePct}% ложных обвинений`,
)

if (!tooHard.length && !tooEasy.length && !badDecoy.length) {
  console.log('Перекосов не видно — либо всё ровно, либо данных ещё мало.\n')
}
