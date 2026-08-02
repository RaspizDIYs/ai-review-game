/**
 * Разрешение хода. Вынесено из компонента специально: это единственное место,
 * где решается, засчитан ответ или нет, и оно должно проверяться тестами,
 * а не кликами.
 *
 * Игрок отмечает сколько угодно строк и отправляет их разом. Так ревью честнее:
 * подлянка бывает размазана по нескольким строкам, а обвинить полфайла «на всякий
 * случай» — это отдельная ошибка, за которую тоже надо платить.
 */

import type { Bug, Outcome, Task } from './types'

export const MAX_ATTEMPTS = 2
export const ENDLESS_LIVES = 3

/** Промах по подлянке типа `missing` засчитывается в пределах ±1 строки. */
const MISSING_TOLERANCE = 1

export function hits(bug: Bug, line: number): boolean {
  return bug.kind === 'missing'
    ? Math.abs(bug.line - line) <= MISSING_TOLERANCE
    : bug.line === line
}

/** Сколько строк подлянки нашли и сколько обвинили зря. */
export interface Coverage {
  found: number
  total: number
  extras: number
}

export type SubmitResult =
  | { kind: 'retry'; wrongPicks: number[]; attempts: number }
  | {
      kind: 'finish'
      outcome: Outcome
      attempt: number
      picks: number[]
      coverage: Coverage | null
    }

/**
 * Отправка отмеченных строк.
 *
 * Пустая отправка — это апрув: «здесь чисто». Отдельной кнопки для него нет,
 * потому что в жизни её тоже нет — не нашёл ничего, значит согласился.
 */
export function resolveSubmit(
  task: Task,
  selected: readonly number[],
  attempts: number,
  maxAttempts = MAX_ATTEMPTS,
): SubmitResult {
  const picks = [...selected].sort((a, b) => a - b)

  if (picks.length === 0) {
    return {
      kind: 'finish',
      outcome: task.clean ? 'clean-correct' : 'missed',
      attempt: attempts + 1,
      picks,
      coverage: null,
    }
  }

  // На чистом раунде любая отмеченная строка — обвинение невиновного.
  // Второй попытки нет: в реальном ревью «я передумал» тоже не отменяет
  // заблокированный мёрдж.
  if (task.clean) {
    return { kind: 'finish', outcome: 'false-accusation', attempt: 1, picks, coverage: null }
  }

  const found = task.bugs.filter((bug) => picks.some((line) => hits(bug, line))).length
  const extras = picks.filter((line) => !task.bugs.some((bug) => hits(bug, line))).length

  // Ни одного попадания — промах и минус попытка.
  if (found === 0) {
    const next = attempts + 1
    return next >= maxAttempts
      ? { kind: 'finish', outcome: 'missed', attempt: next, picks, coverage: null }
      : { kind: 'retry', wrongPicks: picks, attempts: next }
  }

  const coverage: Coverage = { found, total: task.bugs.length, extras }
  const full = found === task.bugs.length && extras === 0

  return {
    kind: 'finish',
    outcome: full ? 'found' : 'partial',
    attempt: attempts + 1,
    picks,
    coverage,
  }
}

/** Таймер кончился: что отмечено, то и не считается — раунд просто уехал в прод. */
export function resolveTimeout(): SubmitResult {
  return {
    kind: 'finish',
    outcome: 'missed',
    attempt: MAX_ATTEMPTS + 1,
    picks: [],
    coverage: null,
  }
}

/** Бесконечный кончается по жизням, остальные режимы — по длине серии. */
export function isRunOver(
  mode: 'daily' | 'endless' | 'set',
  index: number,
  seriesLength: number,
  missed: number,
): boolean {
  return mode === 'endless' ? missed >= ENDLESS_LIVES : index >= seriesLength - 1
}
