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

/** Каждая лишняя строка режет точность на пятую часть — но не в ноль. */
const EXTRA_PENALTY = 0.2
const PARTIAL_FLOOR = 0.25

/**
 * Точность ответа.
 *
 * Со второй попытки дешевле: первая догадка стоит дороже проверенной перебором.
 * Частичный ответ считается по покрытию — сколько строк подлянки нашёл и сколько
 * обвинил зря. Обвинить полфайла и попасть — это не то же самое, что попасть.
 */
export function accuracy(
  outcome: Outcome,
  attempt: number,
  coverage: Coverage | null,
): number {
  if (outcome === 'clean-correct') return 1
  if (outcome === 'found') return attempt === 1 ? 1 : 0.6

  if (outcome === 'partial' && coverage) {
    const share = (coverage.found / coverage.total) * (1 - EXTRA_PENALTY * coverage.extras)
    return Math.max(PARTIAL_FLOOR, share) * (attempt === 1 ? 1 : 0.7)
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
