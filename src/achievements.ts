/**
 * Ачивки. Восемь штук и ни одной за «сыграл N раз»: каждая отмечает навык,
 * а не усидчивость — поймал мутацию пропса, апрувнул чистый код, нашёл
 * за двадцать секунд. Игра про внимательность, награда тоже должна быть про неё.
 *
 * Считаются из настоящей игры и хранятся в localStorage.
 */

import type { IconName } from './ui/icons.tsx'
import type { Outcome, Task } from './types'

export interface Achievement {
  id: string
  icon: IconName
  title: string
  desc: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', icon: 'eye', title: 'Первый улов', desc: 'Найти первую подлянку' },
  { id: 'fast', icon: 'zap', title: 'С первого взгляда', desc: 'Найти быстрее чем за 20 секунд' },
  { id: 'clean', icon: 'shield-check', title: 'Презумпция', desc: 'Правильно апрувнуть чистый код' },
  { id: 'mutation', icon: 'shuffle', title: 'Мутатор', desc: 'Поймать мутацию пропса' },
  { id: 'python', icon: 'file-code', title: 'Змеелов', desc: 'Поймать подлянку в Python' },
  { id: 'perfect', icon: 'trophy', title: 'Чистая проверка', desc: 'Пройти день без пропусков' },
  { id: 'streak3', icon: 'flame', title: 'Три подряд', desc: 'Три найденные подлянки подряд' },
  { id: 'staff', icon: 'crown', title: 'Стафф', desc: 'Набрать 9000 очков за всё время' },
]

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

/** Порог ачивки «Стафф» — он же верхний ранг. */
export const STAFF_XP = 9000

const FAST_SECONDS = 20
const STREAK = 3

export interface RoundContext {
  task: Task
  outcome: Outcome
  /** Сколько секунд ушло на раунд. */
  spent: number
  /** Побед подряд, включая текущую. */
  foundStreak: number
  /** Общий опыт после этого раунда. */
  lifetime: number
}

/** Что открылось по итогам раунда. Дальше вызывающий отсеет уже полученные. */
export function roundUnlocks(ctx: RoundContext): string[] {
  const { task, outcome, spent, foundStreak, lifetime } = ctx
  const ids: string[] = []

  if (outcome === 'found') {
    ids.push('first')
    if (spent < FAST_SECONDS) ids.push('fast')
    if (task.stack === 'py') ids.push('python')
    if (task.bugs.some((b) => b.tag === 'props-mutated-in-place')) ids.push('mutation')
  }

  if (outcome === 'clean-correct') ids.push('clean')
  if (foundStreak >= STREAK) ids.push('streak3')
  if (lifetime >= STAFF_XP) ids.push('staff')

  return ids
}

/** Что открылось по итогам серии. Чистая проверка — только в дневном челлендже. */
export function runUnlocks(mode: string, outcomes: readonly Outcome[]): string[] {
  const perfect =
    outcomes.length > 0 &&
    outcomes.every((o) => o === 'found' || o === 'clean-correct')

  return mode === 'daily' && perfect ? ['perfect'] : []
}
