/**
 * Шаг «почему»: найдя строку, игрок выбирает, что именно с ней не так.
 *
 * Зачем он есть: без него подлянку можно взять угадыванием — самая свежая
 * строка, самая длинная, единственная с индексом. Выбор причины отделяет
 * «ткнул удачно» от «прочитал», и делает это на уже написанном контенте,
 * не требуя ни одной новой задачи.
 *
 * Варианты детерминированы от id задачи: у всех игроков они одинаковые,
 * и разбор дня сравним между людьми — как и вся остальная игра, без сервера.
 */

import { fnv1a } from './daily.ts'
import type { Task } from './types'

/** Правильный плюс три чужих: пять уже не читаются за оставшиеся секунды. */
export const OPTION_COUNT = 4

export interface ReasonOption {
  tag: string
  text: string
  right: boolean
}

/** Ключи, начинающиеся с подчёркивания, — комментарии автора, не формулировки. */
function tags(reasons: Record<string, string>): string[] {
  return Object.keys(reasons).filter((k) => !k.startsWith('_'))
}

/**
 * Отвлекающие берутся из тегов того же стека: «NOT IN с NULL» в раунде про
 * React виден как чужой мгновенно, и выбор перестаёт что-либо проверять.
 * Стека не хватило — добираем откуда есть, лишь бы вариантов было четыре.
 */
function distractors(
  task: Task,
  pool: readonly Task[],
  reasons: Record<string, string>,
  exclude: Set<string>,
  count: number,
): string[] {
  const rank = (tag: string) => fnv1a(`${task.id}:${tag}`)
  const pick = (from: string[]) =>
    from.filter((t) => !exclude.has(t) && reasons[t]).sort((a, b) => rank(a) - rank(b))

  const sameStack = pool
    .filter((t) => t.stack === task.stack)
    .flatMap((t) => t.bugs.map((b) => b.tag))

  const chosen = pick([...new Set(sameStack)]).slice(0, count)
  if (chosen.length >= count) return chosen

  const rest = pick(tags(reasons)).filter((t) => !chosen.includes(t))
  return [...chosen, ...rest].slice(0, count)
}

/**
 * Варианты для задачи. Пусто — если подлянки нет (чистый раунд) или у тега
 * не оказалось формулировки: тогда шаг просто не показывается, а раунд
 * засчитывается как раньше. Сборка пака такого не пропустит, но игра
 * не должна ломаться из-за контента.
 */
export function reasonOptions(
  task: Task,
  pool: readonly Task[],
  reasons: Record<string, string>,
  count = OPTION_COUNT,
): ReasonOption[] {
  const bug = task.bugs[0]
  const right = bug && reasons[bug.tag]
  if (!bug || !right) return []

  const used = new Set(task.bugs.map((b) => b.tag))
  const options: ReasonOption[] = [
    { tag: bug.tag, text: right, right: true },
    ...distractors(task, pool, reasons, used, count - 1).map((tag) => ({
      tag,
      text: reasons[tag],
      right: false,
    })),
  ]

  // Порядок тоже от id: иначе правильный всегда первый.
  return options.sort((a, b) => fnv1a(`${task.id}:${a.tag}`) - fnv1a(`${task.id}:${b.tag}`))
}

/** Причину не угадали — очки за раунд режутся вдвое. Раунд остаётся выигранным. */
export const WRONG_REASON_FACTOR = 0.5
