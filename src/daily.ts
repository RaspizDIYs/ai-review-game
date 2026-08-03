/**
 * Выбор задач дневного челленджа. Полностью детерминирован от даты —
 * поэтому у всех игроков одинаковая серия и при этом не нужен сервер.
 *
 * Задачи разложены в «колоду»: для каждой сложности пул один раз перемешивается
 * стабильным хэшем, и день D берёт из неё элемент по номеру дня. Так задача
 * повторяется не раньше, чем через полный круг своей колоды, — и круг сам
 * удлиняется, когда в пак добавляют новые задачи. Ничего перенастраивать не надо.
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
 * Колода одной сложности: тот же пул, но в стабильно перемешанном порядке.
 * Порядок не зависит от даты — от даты зависит только точка входа в колоду.
 */
function deck(pool: Task[], difficulty: number): Task[] {
  return pool
    .filter((t) => t.difficulty === difficulty)
    .sort((a, b) => fnv1a(`deck:${a.id}`) - fnv1a(`deck:${b.id}`))
}

/** Сложности от желаемой к самой далёкой: 3 → 3, 2, 4, 1, 5. */
function byCloseness(want: number): number[] {
  return [1, 2, 3, 4, 5].sort(
    (a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b,
  )
}

/**
 * Серия дня. Задачи внутри серии не повторяются; между днями повторение
 * возможно не раньше, чем колода нужной сложности пройдена целиком.
 *
 * Сложность подбирается «как можно ближе к плану», а не строго: пул реального
 * пака никогда не покрывает все пятёрки ровно, и падать из-за этого нельзя.
 */
export function pickDaily(pool: Task[], key: string): Task[] {
  const day = challengeNumber(key)
  const wantClean = lastRoundIsClean(key)

  const dirty = pool.filter((t) => !t.clean)
  const clean = pool.filter((t) => t.clean)

  const used = new Set<string>()
  /** Сколько раз уже черпали из этой колоды сегодня — чтобы не взять то же самое. */
  const drawn = new Map<number, number>()
  const series: Task[] = []

  for (let i = 0; i < DIFFICULTY_PLAN.length; i++) {
    const isLast = i === DIFFICULTY_PLAN.length - 1
    // Чистая задача выпадает только в запланированный день и только последней:
    // иначе обещание «примерно раз в пять раз» перестаёт выполняться.
    const from = isLast && wantClean && clean.length > 0 ? clean : dirty

    let picked: Task | undefined

    for (const difficulty of byCloseness(DIFFICULTY_PLAN[i])) {
      const candidates = deck(from, difficulty).filter((t) => !used.has(t.id))
      if (candidates.length === 0) continue

      const offset = drawn.get(difficulty) ?? 0
      drawn.set(difficulty, offset + 1)
      picked = candidates[(day + offset) % candidates.length]
      break
    }

    if (!picked) break // пул кончился — серия просто короче, это не авария

    used.add(picked.id)
    series.push(picked)
  }

  return series
}

/** В бесконечном режиме чистый раунд идёт по счёту, а не по дате. */
const ENDLESS_CLEAN_EVERY = 5

/**
 * Бесконечный режим: сид дополняется номером забега, чтобы серии отличались.
 *
 * Чистота выбирается ДО сложности, а не выпадает из неё. Иначе получается так:
 * сложность растёт с номером раунда, на верхних сложностях грязных задач мало,
 * и с какого-то момента игроку идут одни чистые раунды подряд — что и было.
 *
 * recent — id последних задач забега, чтобы не показывать одно и то же дважды
 * подряд на маленьком пуле.
 */
export function pickEndless(
  pool: Task[],
  seed: string,
  index: number,
  recent: readonly string[] = [],
): Task {
  return pickStream(pool, seed, index, recent, Math.min(5, 1 + Math.floor(index / 2)))
}

/**
 * Смена: сложность не подбирается вовсе.
 *
 * Игрок выбрал свой стек и обязан знать его целиком: подлянка в собственном
 * бэкенде бывает и на пятёрке в первый же ход. Разгон по сложности здесь
 * был бы обещанием, которого прод не даёт.
 */
export function pickShift(
  pool: Task[],
  seed: string,
  index: number,
  recent: readonly string[] = [],
): Task {
  return pickStream(pool, seed, index, recent, null)
}

/**
 * Общий выбор для потоковых режимов. `wantDifficulty` — к какой сложности
 * тянуться; null означает «любая, как выпадет».
 *
 * Пул может быть меньше числа раундов — это нормально: задачи повторяются,
 * но не подряд, за это отвечает `recent`.
 */
function pickStream(
  pool: Task[],
  seed: string,
  index: number,
  recent: readonly string[],
  wantDifficulty: number | null,
): Task {
  const wantClean = index > 0 && (index + 1) % ENDLESS_CLEAN_EVERY === 0

  // Если задач нужной чистоты нет вовсе — берём любые: закончить забег
  // с неидеальным раундом лучше, чем упереться в стену.
  const byClean = pool.filter((t) => t.clean === wantClean)
  const source = byClean.length > 0 ? byClean : pool

  const fresh = source.filter((t) => !recent.includes(t.id))
  const candidates = fresh.length > 0 ? fresh : source

  return candidates
    .map((task) => ({
      task,
      difficultyMiss: wantDifficulty === null ? 0 : Math.abs(task.difficulty - wantDifficulty),
      tie: fnv1a(`${seed}:${index}:${task.id}`),
    }))
    .sort((a, b) => a.difficultyMiss - b.difficultyMiss || a.tie - b.tie)[0].task
}
