/**
 * Уровень проверяющего и своя подборка.
 *
 * Уровень — это не рейтинг игрока, а потолок сложности: человек сам говорит,
 * на что подписывается. Это честнее автоматической подстройки, которая на
 * коротких сессиях всё равно не успевает ничего измерить, и заодно снимает
 * главный риск проекта — «что очевидно нам, новичку невозможно».
 *
 * Подборка детерминирована от сида: та же настройка и тот же сид дают ту же
 * тройку задач. Сервер, как и везде в игре, не нужен.
 */

import { fnv1a } from './daily.ts'
import type { Difficulty, Stack, Task } from './types'

export type LevelId = 'trainee' | 'junior' | 'middle' | 'senior'

export interface Level {
  id: LevelId
  label: string
  /** Потолок сложности: «до 3» значит, что четвёрок и пятёрок не будет. */
  max: Difficulty
  /** Сложности трёх раундов: всегда разгон, а не стена с первого экрана. */
  plan: readonly Difficulty[]
}

export const LEVELS: readonly Level[] = [
  { id: 'trainee', label: 'Стажёр', max: 2, plan: [1, 1, 2] },
  { id: 'junior', label: 'Джун', max: 3, plan: [1, 2, 3] },
  { id: 'middle', label: 'Мидл', max: 4, plan: [2, 3, 4] },
  { id: 'senior', label: 'Сеньор', max: 5, plan: [3, 4, 5] },
]

export const SET_SIZE = 3

export function level(id: LevelId): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[1]
}

/** Каждая пятая подборка заканчивается чистым раундом — как и дневная серия. */
const CLEAN_EVERY = 5

/** Сложности от желаемой к самой далёкой, но не выше потолка уровня. */
function byCloseness(want: number, max: number): number[] {
  return [1, 2, 3, 4, 5]
    .filter((d) => d <= max)
    .sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b)
}

/**
 * Тройка задач под уровень и выбранные языки.
 *
 * Языки не режутся поровну: слот достаётся тому из выбранных, у кого меньше
 * уже взятых задач и при этом есть чем закрыть нужную сложность. Поэтому
 * язык, у которого на этом уровне ничего нет, молча получает ноль, а не
 * ломает подборку — ровно это и показывает список языков на главной.
 */
export function pickSet(
  pool: readonly Task[],
  levelId: LevelId,
  stacks: readonly Stack[],
  seed: string,
): Task[] {
  const { max, plan } = level(levelId)
  const wantClean = fnv1a(`${seed}:clean`) % CLEAN_EVERY === 0

  const available = pool.filter((t) => stacks.includes(t.stack) && t.difficulty <= max)

  const used = new Set<string>()
  const taken = new Map<Stack, number>()
  const set: Task[] = []

  for (let i = 0; i < plan.length; i++) {
    const isLast = i === plan.length - 1
    const from = available.filter(
      (t) => !used.has(t.id) && t.clean === (isLast && wantClean),
    )
    // Чистых задач на этом уровне может не быть вовсе — тогда обычный раунд.
    const candidates = from.length > 0 ? from : available.filter((t) => !used.has(t.id))

    let picked: Task | undefined
    for (const difficulty of byCloseness(plan[i], max)) {
      const fit = candidates.filter((t) => t.difficulty === difficulty)
      if (fit.length === 0) continue

      picked = fit.sort(
        (a, b) =>
          (taken.get(a.stack) ?? 0) - (taken.get(b.stack) ?? 0) ||
          fnv1a(`${seed}:${i}:${a.id}`) - fnv1a(`${seed}:${i}:${b.id}`),
      )[0]
      break
    }

    if (!picked) break // выбранные языки кончились — подборка просто короче

    used.add(picked.id)
    taken.set(picked.stack, (taken.get(picked.stack) ?? 0) + 1)
    set.push(picked)
  }

  return set
}

/**
 * Сколько задач по каждому языку доступно на выбранном уровне — то есть из чего
 * вообще собирается подборка.
 *
 * Это не раскладка тройки: игроку важно видеть, что за Python есть пятнадцать
 * задач, а не что сегодня выпала одна. Ноль значит «на этом уровне ничего нет,
 * подними потолок», прочерк — «по языку задач ещё не написали».
 */
export function availability(
  pool: readonly Task[],
  levelId: LevelId,
  all: readonly Stack[],
): Map<Stack, number | null> {
  const { max } = level(levelId)
  const counts = new Map<Stack, number | null>()

  for (const stack of all) {
    const own = pool.filter((t) => t.stack === stack)
    counts.set(stack, own.length === 0 ? null : own.filter((t) => t.difficulty <= max).length)
  }

  return counts
}

/** Есть ли у языка хоть что-то на этом уровне — иначе выбирать его бессмысленно. */
export function playable(pool: readonly Task[], levelId: LevelId, stack: Stack): boolean {
  const { max } = level(levelId)
  return pool.some((t) => t.stack === stack && t.difficulty <= max)
}
