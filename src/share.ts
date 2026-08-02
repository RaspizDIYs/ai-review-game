/**
 * Строка для шеринга. Ни строки кода, ни намёка на то, что за подлянка —
 * иначе тот, кому её прислали, уже не сыграет.
 */

import type { Outcome } from './types'
// Расширение обязательно: этот модуль грузится и Vite, и напрямую Node в тестах.
import { challengeNumber } from './daily.ts'

const SQUARE: Record<Outcome, string> = {
  found: '🟩',
  'clean-correct': '🟩',
  missed: '🟥',
  'false-accusation': '⬜',
}

export function isWin(outcome: Outcome): boolean {
  return outcome === 'found' || outcome === 'clean-correct'
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function buildShare(day: string, outcomes: Outcome[], seconds: number): string {
  const grid = outcomes.map((o) => SQUARE[o]).join('')
  const wins = outcomes.filter(isWin).length

  return [
    `Ревью за ИИ #${challengeNumber(day)}`,
    `${grid}  ${wins}/${outcomes.length}  ${formatTime(seconds)}`,
  ].join('\n')
}

/** Возвращает false, если скопировать не вышло — тогда показываем текст руками. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
