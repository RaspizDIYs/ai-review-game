/**
 * Разрешение хода. Вынесено из компонента специально: это единственное место,
 * где решается, засчитан ответ или нет, и оно должно проверяться тестами,
 * а не кликами.
 */

import type { Outcome, Task } from './types'
import { isCorrectLine } from './scoring.ts'

export const MAX_ATTEMPTS = 2
export const ENDLESS_LIVES = 3

export type PickResult =
  | { kind: 'continue'; wrongPicks: number[] }
  | { kind: 'finish'; outcome: Outcome; attempt: number; line: number | null }

export function resolveLineClick(
  task: Task,
  line: number,
  wrongPicks: number[],
  maxAttempts = MAX_ATTEMPTS,
): PickResult {
  // На чистом раунде любой клик по строке — обвинение. Второй попытки нет:
  // в реальном ревью «я передумал» тоже не отменяет заблокированный мёрдж.
  if (task.clean) {
    return { kind: 'finish', outcome: 'false-accusation', attempt: 1, line }
  }

  if (isCorrectLine(task, line)) {
    return { kind: 'finish', outcome: 'found', attempt: wrongPicks.length + 1, line }
  }

  const next = [...wrongPicks, line]
  return next.length >= maxAttempts
    ? { kind: 'finish', outcome: 'missed', attempt: maxAttempts + 1, line }
    : { kind: 'continue', wrongPicks: next }
}

export function resolveClaimClean(task: Task, wrongPicks: number[]): PickResult {
  return task.clean
    ? { kind: 'finish', outcome: 'clean-correct', attempt: wrongPicks.length + 1, line: null }
    : { kind: 'finish', outcome: 'missed', attempt: MAX_ATTEMPTS + 1, line: null }
}

export function resolveTimeout(): PickResult {
  return { kind: 'finish', outcome: 'missed', attempt: MAX_ATTEMPTS + 1, line: null }
}

export function isRunOver(
  mode: 'daily' | 'endless',
  index: number,
  seriesLength: number,
  missed: number,
): boolean {
  return mode === 'daily' ? index >= seriesLength - 1 : missed >= ENDLESS_LIVES
}
