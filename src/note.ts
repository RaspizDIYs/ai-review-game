/**
 * Комментарий автора прямо в коде.
 *
 * Зачем: в слепой смене автор PR неизвестен, и единственный способ что-то
 * о нём узнать — терминал. Это дорого и не всегда окупается. Комментарий
 * в коде — бесплатная зацепка того же рода: он ничего не говорит о подлянке,
 * зато звучит характером. «на вырост: следующий слой ляжет сюда же» — это
 * Архитектор, а у него в досье написано, чем он обычно ломает.
 *
 * Два правила, оба про честность:
 *
 * - комментарий **не показывает на подлянку**. Он садится на строку, выбранную
 *   хэшем, и специально обходит и строки подлянок, и обманки: иначе это была бы
 *   стрелка «смотри сюда», а не почерк;
 * - комментарий **не двигает номера строк**. Он дописывается в хвост
 *   существующей строки, а не вставляется отдельной, — по номерам считается
 *   всё: попадания, обманки, слежка, разбор.
 */

import { noteLine, type Agent } from './agents.ts'
import { fnv1a } from './daily.ts'
import { parseDiff } from './diff.ts'
import { hits } from './round.ts'
import type { Stack, Task } from './types'

/** Чем в этом языке начинается комментарий. */
const PREFIX: Partial<Record<Stack, string>> = {
  py: '#',
  rb: '#',
  sh: '#',
  yaml: '#',
  docker: '#',
  sql: '--',
}

export function commentPrefix(stack: Stack): string {
  return PREFIX[stack] ?? '//'
}

export interface CodeNote {
  /** Индекс строки дифа, в хвост которой дописывается комментарий. */
  index: number
  text: string
}

/**
 * Куда и что напишет автор. null — подходящей строки не нашлось; это нормально
 * и ничего не ломает.
 */
export function codeNote(task: Task, agent: Agent, seed: string): CodeNote | null {
  const lines = parseDiff(task.diff)

  const spots = lines.filter(
    (line) =>
      line.kind === 'add' &&
      line.newNo !== null &&
      line.text.trim().length > 8 &&
      // Строку подлянки обходим: комментарий рядом с ней читается как указатель.
      !task.bugs.some((bug) => hits(bug, line.newNo!)) &&
      !task.decoys.some((decoy) => decoy.line === line.newNo) &&
      // В строке уже есть комментарий — второй превратит её в кашу.
      !line.text.includes(commentPrefix(task.stack)),
  )

  if (spots.length === 0) return null

  const spot = spots[fnv1a(`spot:${task.id}:${seed}`) % spots.length]
  return { index: spot.index, text: `${commentPrefix(task.stack)} ${noteLine(agent, seed)}` }
}
