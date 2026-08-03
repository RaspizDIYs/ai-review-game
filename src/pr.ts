/**
 * Пул-реквест вокруг задачи.
 *
 * Игра притворяется рабочим днём, а рабочий день начинается не с «раунда №3»,
 * а со строки в списке PR: репозиторий, заголовок в стиле conventional commits,
 * ветка, метки, номер. Всё это выводится из самой задачи — из того, что
 * попросили у ИИ и какие файлы она тронула, — поэтому заголовок меняется
 * вместе с заданием и не выглядит подписью-заглушкой.
 *
 * Имя репозитория игрок задаёт сам на главной: это его проект, а не наш.
 */

import type { Task } from './types'

export const DEFAULT_REPO = 'raspiz/vet-crm'
/** Номер первого PR за сессию — дальше по одному на раунд. */
export const PR_BASE = 1408
const MAX_REPO = 40

export type PrType = 'feat' | 'fix' | 'perf' | 'refactor' | 'test' | 'chore'

export interface PullRequest {
  repo: string
  number: number
  /** `feat(report): отчёт за период` */
  title: string
  type: PrType
  scope: string
  branch: string
  labels: string[]
  /** Сколько файлов тронул диф — для строки «хочет влить …». */
  files: number
}

/**
 * Тип коммита по глаголу из запроса. Список короткий нарочно: сюда попали
 * только те формулировки, которые в паке действительно встречаются, всё
 * остальное — обычная фича, и это честный ответ по умолчанию.
 */
const TYPE_WORDS: [PrType, RegExp][] = [
  ['fix', /(почини|исправ|не долж|не пада|не тер|разберись|перестан|чтобы не)/i],
  ['perf', /(ускор|оптимиз|закэшир|кэшир|не тормоз|быстре)/i],
  ['refactor', /(перепиш|перенес|приведи|разбей|разбери|вынеси|упрост)/i],
  ['test', /(покрой|тест)/i],
  ['chore', /(обнови|импортир|подними верси|зависимост)/i],
]

export function prType(task: Task): PrType {
  for (const [type, re] of TYPE_WORDS) if (re.test(task.prompt)) return type
  return 'feat'
}

/**
 * Область — по файлу, который правили. Берём первый `+++` из дифа: это тот
 * файл, который игрок сейчас и увидит.
 */
export function prScope(task: Task): string {
  const head = /^\+\+\+ b\/(.+)$/m.exec(task.diff)?.[1] ?? task.bugs[0]?.file ?? ''
  const name = head.split('/').pop() ?? ''
  const bare = name.replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, '')
  // DeepLink.swift → deep-link: область коммита пишут в нижнем регистре,
  // а имена файлов в разных языках оформлены по-разному.
  const kebab = bare
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()

  return kebab || task.stack
}

/** Сколько разных файлов тронуто — по заголовкам дифа. */
function fileCount(task: Task): number {
  return new Set(task.diff.match(/^\+\+\+ b\/.+$/gm) ?? []).size || 1
}

/** «Отчёт за период» → «отчёт за период», но «SQL-витрина» остаётся собой. */
function lowerFirst(s: string): string {
  if (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase()) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Ветку ИИ называет по задаче — так же, как это делают боты в настоящем гите. */
export function prBranch(task: Task): string {
  return `ai/${task.id.replace(/-(\d+)$/, '')}`
}

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'good first review',
  2: 'good first review',
  3: 'needs review',
  4: 'needs review',
  5: 'high risk',
}

/**
 * Имя репозитория, введённое игроком. Пустое поле — значение по умолчанию:
 * игра не должна ломаться о пробел, случайно оставленный в настройках.
 */
export function normalizeRepo(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    // Кириллицу оставляем: имя проекта здесь — украшение, а не адрес на гитхабе.
    .replace(/[^\p{L}\p{N}._\-/]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '')
    .slice(0, MAX_REPO)

  return cleaned || DEFAULT_REPO
}

export function pullRequest(task: Task, number: number, repo: string): PullRequest {
  const type = prType(task)
  const scope = prScope(task)

  return {
    repo: normalizeRepo(repo),
    number,
    type,
    scope,
    title: `${type}(${scope}): ${lowerFirst(task.title)}`,
    branch: prBranch(task),
    labels: [task.stack, DIFFICULTY_LABEL[task.difficulty] ?? 'needs review'],
    files: fileCount(task),
  }
}
