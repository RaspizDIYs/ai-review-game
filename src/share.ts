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
  // Частичный ответ и обвинение невиновного — один и тот же белый квадрат:
  // получателю строки важно, что раунд не взят, а подробности — спойлер.
  partial: '⬜',
  'false-accusation': '⬜',
}

export function isWin(outcome: Outcome): boolean {
  return outcome === 'found' || outcome === 'clean-correct'
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Третья строка — адрес игры. Без неё тот, кому прислали результат, не может
 * сыграть немедленно, а вся виральность дневного челленджа держится ровно
 * на этом. В тестах под Node `import.meta.env` нет — тогда строки просто нет.
 */
// Приведение типа, а не import.meta.env напрямую: этот модуль компилируется
// и конфигом приложения (там есть типы Vite), и тестовым (там их нет).
const SITE: string | undefined = (import.meta as { env?: Record<string, string> }).env
  ?.VITE_SITE_URL

export function buildShare(day: string, outcomes: Outcome[], seconds: number): string {
  const grid = outcomes.map((o) => SQUARE[o]).join('')
  const wins = outcomes.filter(isWin).length

  return [
    `Ревью за ИИ #${challengeNumber(day)}`,
    `${grid}  ${wins}/${outcomes.length}  ${formatTime(seconds)}`,
    SITE,
  ]
    .filter(Boolean)
    .join('\n')
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
