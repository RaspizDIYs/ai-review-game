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
}

export const STACKS = Object.keys(STACK_LABEL) as Stack[]
