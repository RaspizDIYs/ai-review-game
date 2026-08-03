/** Очки по формуле из ТЗ. */

import type { Coverage } from './round.ts'
import type { Outcome, Task } from './types'

export const ROUND_SECONDS = 90

/** Пропустил подлянку — ночью инцидент, следующий раунд играешь уставшим. */
const FATIGUE_PENALTY = 15
const MIN_ROUND_SECONDS = 45

export function roundDuration(missed: number): number {
  return Math.max(MIN_ROUND_SECONDS, ROUND_SECONDS - FATIGUE_PENALTY * missed)
}

/** Промах по подлянке типа `missing` засчитывается в пределах ±1 строки. */
const MISSING_TOLERANCE = 1

export function isCorrectLine(task: Task, line: number): boolean {
  return task.bugs.some((bug) =>
    bug.kind === 'missing'
      ? Math.abs(bug.line - line) <= MISSING_TOLERANCE
      : bug.line === line,
  )
}

export function findDecoy(task: Task, line: number) {
  return task.decoys.find((d) => d.line === line)
}

/** Честно найденная часть без лишних обвинений стоит не меньше четверти. */
const PARTIAL_FLOOR = 0.25

/**
 * Точность ответа.
 *
 * Со второй попытки дешевле: первая догадка стоит дороже проверенной перебором.
 *
 * Частичный ответ считается по двум числам сразу: сколько строк подлянки нашёл
 * (полнота) и какая доля отмеченного вообще была подлянкой (точность).
 * Одной полноты мало — по ней «отметить весь файл» даёт единицу.
 *
 * Порог снизу действует только тогда, когда лишних обвинений нет. Иначе
 * он превращается в гарантию: натыкал полфайла, задел подлянку — и всё равно
 * получил четверть очков, да ещё и без потерянной жизни в бесконечном.
 */
export function accuracy(
  outcome: Outcome,
  attempt: number,
  coverage: Coverage | null,
): number {
  if (outcome === 'clean-correct') return 1
  if (outcome === 'found') return attempt === 1 ? 1 : 0.6

  if (outcome === 'partial' && coverage) {
    const recall = coverage.found / coverage.total
    const precision = coverage.found / (coverage.found + coverage.extras)
    const share = coverage.extras === 0 ? Math.max(PARTIAL_FLOOR, recall) : recall * precision

    return share * (attempt === 1 ? 1 : 0.7)
  }

  return 0
}

/**
 * Считается от длительности ЭТОГО раунда, а не от базовых 90 секунд.
 * Иначе усталость наказывает дважды: и времени меньше, и потолок множителя
 * падает до 0.5 — за мгновенный ответ в 45-секундном раунде.
 */
export function timeMultiplier(secondsLeft: number, duration = ROUND_SECONDS): number {
  return Math.max(0.2, secondsLeft / duration)
}

export function roundScore(
  difficulty: number,
  secondsLeft: number,
  acc: number,
  duration = ROUND_SECONDS,
): number {
  return Math.round(difficulty * 100 * timeMultiplier(secondsLeft, duration) * acc)
}
