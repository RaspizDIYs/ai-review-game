/**
 * Подписи стеков и порядок в списке языков.
 *
 * Порядок — не алфавит и не популярность вообще, а популярность у тех, кто
 * играет: сверху то, на чём ИИ пишут чаще всего. Язык без задач из списка
 * не убираем — прочерк напротив него честнее, чем его отсутствие: видно,
 * что он планируется.
 */

import type { Stack } from './types'

export const STACK_LABEL: Record<Stack, string> = {
  js: 'JavaScript / TypeScript',
  py: 'Python',
  sql: 'SQL',
  cs: 'C# / .NET',
  go: 'Go',
  rs: 'Rust',
  java: 'Java / Kotlin',
  php: 'PHP',
  cpp: 'C++',
  rb: 'Ruby',
  swift: 'Swift',
  sh: 'Bash / shell',
  docker: 'Docker / сборка',
  yaml: 'CI / пайплайны',
}

export const STACKS = Object.keys(STACK_LABEL) as Stack[]

/**
 * Роль языка в стеке. Нужна только смене: там игрок выбирает не «языки»,
 * а свой стек — чем пишет фронт, чем бэк и чем катит. Смысл в том, что свой
 * стек человек обязан знать целиком, на любой сложности, — поэтому потолка
 * сложности в смене нет.
 */
export type StackRole = 'front' | 'back' | 'pipeline'

export const STACK_ROLE: Record<StackRole, { label: string; hint: string; of: Stack[] }> = {
  front: { label: 'фронт', hint: 'чем рисуете', of: ['js', 'swift'] },
  back: {
    label: 'бэкенд',
    hint: 'чем пишете сервер',
    of: ['py', 'cs', 'go', 'rs', 'java', 'php', 'rb', 'cpp'],
  },
  pipeline: { label: 'пайплайн', hint: 'чем катите', of: ['docker', 'yaml', 'sh'] },
}

export interface ShiftStack {
  front: Stack
  back: Stack
  pipeline: Stack
}

export const DEFAULT_SHIFT_STACK: ShiftStack = { front: 'js', back: 'py', pipeline: 'docker' }

/** База в стеке есть у всех, поэтому SQL не выбирается, а входит всегда. */
export function shiftStacks(stack: ShiftStack): Stack[] {
  return [stack.front, stack.back, 'sql', stack.pipeline]
}
