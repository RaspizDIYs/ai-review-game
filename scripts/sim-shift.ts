/**
 * Калибровка смены: как она кончается при разном качестве ревью.
 *
 * Метрик с живых игроков нет и не будет (бэкенда нет), поэтому баланс
 * проверяется моделью игрока: доли исходов задаются руками, прогон
 * детерминирован. Это не замена проверке на людях — это способ поймать
 * заведомо сломанное правило до того, как в него кто-то сыграет.
 *
 * Чего ждём от таблицы:
 *   — здоровье монотонно падает от идеального к слабому;
 *   — средний ревьюер заканчивает смену где-то на сорока;
 *   — идеальный НЕ теряет скорость: наказание за работу — сломанное правило;
 *   — перестраховщик теряет скорость и за несколько смен доезжает до снятия.
 *
 * `npm run sim`
 */
import { readFileSync } from 'node:fs'
import { fnv1a } from '../src/daily.ts'
import { finish, isShiftOver, repair, review, start } from '../src/shift.ts'
import type { Outcome, Task } from '../src/types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('../src/content/pack.json', import.meta.url), 'utf8'),
)
const DIRTY = PACK.filter((t) => !t.clean)
const CLEAN = PACK.filter((t) => t.clean)
const byId = new Map(PACK.map((t) => [t.id, t]))

/**
 * Доли исходов: нашёл / частично / пропустил / зря обвинил.
 * `diagnosis` — с какой вероятностью игрок опознаёт виновный PR по логу.
 * Вслепую это отдельный навык, и он важнее, чем кажется: неопознанная мина
 * течёт до конца смены.
 */
type Player = {
  name: string
  found: number
  partial: number
  missed: number
  wrong: number
  diagnosis: number
}

const PLAYERS: Player[] = [
  { name: 'идеальный', found: 1, partial: 0, missed: 0, wrong: 0, diagnosis: 1 },
  { name: 'хороший', found: 0.7, partial: 0.15, missed: 0.15, wrong: 0, diagnosis: 0.7 },
  { name: 'средний', found: 0.5, partial: 0.2, missed: 0.3, wrong: 0, diagnosis: 0.5 },
  { name: 'слабый', found: 0.3, partial: 0.2, missed: 0.5, wrong: 0, diagnosis: 0.25 },
  { name: 'перестраховщик', found: 0.9, partial: 0, missed: 0.1, wrong: 1, diagnosis: 0.6 },
  { name: 'не чинит вовсе', found: 0.5, partial: 0.2, missed: 0.3, wrong: 0, diagnosis: -1 },
]

function outcome(p: Player, roll: number, clean: boolean): Outcome {
  if (clean) return roll < p.wrong ? 'false-accusation' : 'clean-correct'
  if (roll < p.found) return 'found'
  if (roll < p.found + p.partial) return 'partial'
  return 'missed'
}

/** Как часто игрок «находит» подлянку там, где её нет, и ломает чистый PR. */
const FALSE_POSITIVE = 0.2

const RUNS = 400

for (const p of PLAYERS) {
  let health = 0
  let velocity = 0
  let debt = 0
  let burned = 0
  let fired = 0

  for (let run = 0; run < RUNS; run++) {
    let s = start()
    let turn = 0
    /** Мины, о которых игрок уже знает: прод падает, но ещё не починено. */
    let alerts: number[] = []
    let attempts = 0

    while (!isShiftOver(s)) {
      // Прод упал — игрок чинит руками. Ход на это не тратится, но каждая
      // попытка это тик: пока возишься, дотикает соседнее.
      if (alerts.length > 0 && p.diagnosis >= 0) {
        const merged = s.log.filter((e) => e.kind === 'merged')
        const diag = (fnv1a(`diag:${p.name}:${run}:${turn}:${attempts}`) % 1000) / 1000
        const guess =
          diag < p.diagnosis
            ? merged.find((e) => e.kind === 'merged' && e.pr === alerts[0])
            : merged[fnv1a(`pick:${p.name}:${run}:${turn}:${attempts}`) % Math.max(1, merged.length)]

        const task = guess?.kind === 'merged' ? byId.get(guess.task) : undefined
        if (!task || !guess || guess.kind !== 'merged') break

        // Открыл PR и решает, есть ли там что править. В грязном находит
        // с тем же навыком, что и в ревью; в чистом иногда видит несуществующее
        // и ломает его — но чаще просто закрывает и идёт дальше.
        const dirty = s.defects.some((d) => d.pr === guess.pr)
        const roll = (fnv1a(`fix:${p.name}:${run}:${turn}:${attempts}`) % 1000) / 1000

        if (!dirty && roll > FALSE_POSITIVE) {
          attempts++
          if (attempts > 12) { alerts = []; attempts = 0 }
          continue
        }

        const step = repair(s, guess.pr, task, dirty && roll < p.found ? 'found' : 'missed')

        s = step.shift
        alerts = s.defects.filter((d) => d.known).map((d) => d.pr)
        attempts++
        // В игре попытки не ограничены, но модель не может ковыряться вечно:
        // после десятой считаем, что игрок махнул рукой и пошёл работать.
        if (attempts > 10) {
          alerts = []
          attempts = 0
        }
        continue
      }
      attempts = 0

      // Каждый пятый PR чистый — как в базовой игре.
      const clean = turn % 5 === 4
      const pool = clean ? CLEAN : DIRTY
      const task = pool[fnv1a(`sim:${p.name}:${run}:${turn}`) % pool.length]
      const roll = (fnv1a(`roll:${p.name}:${run}:${turn}`) % 1000) / 1000

      const step = review(s, task, outcome(p, roll, clean))
      s = step.shift
      alerts = s.defects.filter((d) => d.known).map((d) => d.pr)
      turn++
    }

    const end = finish(s)
    health += end.prod.health
    velocity += end.prod.velocity
    debt += end.debt
    if (end.verdict === 'burned') burned++
    if (end.verdict === 'fired') fired++
  }

  const avg = (n: number) => (n / RUNS).toFixed(1).padStart(5)
  console.log(
    `${p.name.padEnd(16)} здоровье ${avg(health)}  скорость ${avg(velocity)}  долг ${avg(debt)}  ` +
      `сгорел ${String(Math.round((burned / RUNS) * 100)).padStart(3)}%  снят ${String(Math.round((fired / RUNS) * 100)).padStart(3)}%`,
  )
}
