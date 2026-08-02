/**
 * Выбор задач дневного челленджа. Полностью детерминирован от даты —
 * поэтому у всех игроков одинаковая серия и при этом не нужен сервер.
 */

import type { Task } from './types'

/** С этого дня считается нумерация челленджей: 2026-08-02 — это #1. */
const EPOCH = Date.UTC(2026, 7, 2)

const DAY = 86_400_000

/** Сложности раундов: разгон, а не случайная стена. */
export const DIFFICULTY_PLAN = [1, 2, 3, 3, 4] as const

/** Каждый пятый день последний раунд подменяется на чистый. */
const CLEAN_EVERY = 5

export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Ключ дня по UTC — чтобы серия менялась у всех одновременно. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function challengeNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / DAY) + 1
}

export function msUntilNextDay(now: Date = new Date()): number {
  const [y, m, d] = dayKey(now).split('-').map(Number)
  return Date.UTC(y, m - 1, d) + DAY - now.getTime()
}

/** Последний раунд серии — чистый? */
export function lastRoundIsClean(key: string): boolean {
  return fnv1a(`${key}:clean`) % CLEAN_EVERY === 0
}

/**
 * Серия дня. Задачи в серии не повторяются, поэтому длина ограничена размером пака:
 * пока в нём меньше пяти задач, серия будет короче — это временно, до M2.
 *
 * Сложность подбирается «как можно ближе к плану», а не строго: пул реального
 * пака никогда не покрывает все пятёрки ровно, и падать из-за этого нельзя.
 */
export function pickDaily(pool: Task[], key: string): Task[] {
  const wantClean = lastRoundIsClean(key)
  const used = new Set<string>()
  const series: Task[] = []

  const slots = Math.min(DIFFICULTY_PLAN.length, pool.length)

  for (let i = 0; i < slots; i++) {
    const wantDifficulty = DIFFICULTY_PLAN[i]
    const isLast = i === slots - 1
    const preferClean = isLast && wantClean

    const candidates = pool.filter((t) => !used.has(t.id))

    // Ранжируем: сначала совпадение по «чистоте», потом близость сложности,
    // потом стабильный хэш — он и делает выбор одинаковым у всех.
    const best = candidates
      .map((task) => ({
        task,
        cleanMiss: task.clean === preferClean ? 0 : 1,
        difficultyMiss: Math.abs(task.difficulty - wantDifficulty),
        tie: fnv1a(`${key}:${i}:${task.id}`),
      }))
      .sort(
        (a, b) =>
          a.cleanMiss - b.cleanMiss ||
          a.difficultyMiss - b.difficultyMiss ||
          a.tie - b.tie,
      )[0]

    used.add(best.task.id)
    series.push(best.task)
  }

  return series
}

/**
 * Бесконечный режим: тот же детерминированный подбор, но сид дополняется
 * номером забега, чтобы серии отличались. Пул может кончиться — тогда
 * задачи начинают повторяться, и это честнее, чем упереться в стену.
 */
export function pickEndless(pool: Task[], seed: string, index: number): Task {
  const wantDifficulty = Math.min(5, 1 + Math.floor(index / 2))
  const ranked = pool
    .map((task) => ({
      task,
      difficultyMiss: Math.abs(task.difficulty - wantDifficulty),
      tie: fnv1a(`${seed}:${index}:${task.id}`),
    }))
    .sort((a, b) => a.difficultyMiss - b.difficultyMiss || a.tie - b.tie)

  return ranked[0].task
}
