/**
 * Прогресс в localStorage. Бэкенда нет и не планируется в MVP,
 * см. заметку «Бэкенда в MVP нет».
 */

import type { Outcome } from './types'

const KEY = 'review-after-ai:v1'

export interface DailyRecord {
  /** По одному на раунд, в порядке серии. */
  outcomes: Outcome[]
  score: number
  /** Суммарно секунд на всю серию. */
  seconds: number
}

interface Save {
  v: 1
  daily: Record<string, DailyRecord>
  bestEndless: number
  streakCurrent: number
  streakLastDay: string | null
}

const EMPTY: Save = {
  v: 1,
  daily: {},
  bestEndless: 0,
  streakCurrent: 0,
  streakLastDay: null,
}

function read(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw)
    // Схему меняем — старое просто выбрасываем: это игровой прогресс,
    // а не данные, ради которых стоит писать миграции.
    if (parsed?.v !== 1) return { ...EMPTY }
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

function write(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Приватный режим или переполненное хранилище — играть это не мешает.
  }
}

export function getDaily(day: string): DailyRecord | null {
  return read().daily[day] ?? null
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10)
}

export function saveDaily(day: string, record: DailyRecord): void {
  const save = read()
  if (save.daily[day]) return // один заход в день, переписывать нечего

  save.daily[day] = record
  save.streakCurrent = save.streakLastDay === previousDay(day) ? save.streakCurrent + 1 : 1
  save.streakLastDay = day
  write(save)
}

export function getStreak(today: string): number {
  const save = read()
  if (!save.streakLastDay) return 0
  // Серия жива, только если последний заход был сегодня или вчера.
  if (save.streakLastDay === today || save.streakLastDay === previousDay(today)) {
    return save.streakCurrent
  }
  return 0
}

export function getBestEndless(): number {
  return read().bestEndless
}

export function saveEndless(score: number): boolean {
  const save = read()
  if (score <= save.bestEndless) return false
  save.bestEndless = score
  write(save)
  return true
}
