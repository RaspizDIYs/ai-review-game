/** Очки по формуле из ТЗ. */

import type { Task } from './types'

export const ROUND_SECONDS = 90

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

/** 1.0 с первого клика, 0.6 со второго, иначе 0. */
export function accuracy(attempt: number, found: boolean): number {
  if (!found) return 0
  return attempt === 1 ? 1 : 0.6
}

export function timeMultiplier(secondsLeft: number): number {
  return Math.max(0.2, secondsLeft / ROUND_SECONDS)
}

export function roundScore(
  difficulty: number,
  secondsLeft: number,
  acc: number,
): number {
  return Math.round(difficulty * 100 * timeMultiplier(secondsLeft) * acc)
}
