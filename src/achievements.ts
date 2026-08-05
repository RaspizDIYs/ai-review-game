/**
 * Ачивки. Ни одной за «сыграл N раз»: каждая отмечает навык, а не усидчивость —
 * поймал мутацию пропса, апрувнул чистый код, нашёл за двадцать секунд.
 * Игра про внимательность, награда тоже должна быть про неё.
 *
 * Три этажа. Языковые открываются сами собой, пока играешь; счётчики
 * пойманных подлянок отмечают пробег; и наверху — те, ради которых надо
 * специально постараться: все языки, все ачивки, десять находок подряд.
 *
 * Считаются из настоящей игры и хранятся в localStorage.
 */

import { STACKS } from './stacks.ts'
import type { IconName } from './ui/icon-names.ts'
import type { Outcome, Stack, Task } from './types'

export interface Achievement {
  id: string
  icon: IconName
  title: string
  desc: string
  /** Вместо иконки — код языка: двенадцать одинаковых значков не различить. */
  badge?: string
}

/** Языковые: по одной на стек, id собирается из кода — `lang-py`. */
const LANGS: Record<Stack, { badge: string; title: string; lang: string }> = {
  js: { badge: 'js', title: 'Скриптолов', lang: 'JavaScript' },
  py: { badge: 'py', title: 'Змеелов', lang: 'Python' },
  sql: { badge: 'sql', title: 'Запросчик', lang: 'SQL' },
  cs: { badge: 'c#', title: 'Решёточник', lang: 'C#' },
  go: { badge: 'go', title: 'Суслик', lang: 'Go' },
  rs: { badge: 'rs', title: 'Ржавый', lang: 'Rust' },
  java: { badge: 'jvm', title: 'Кофевар', lang: 'Java' },
  php: { badge: 'php', title: 'Слоновод', lang: 'PHP' },
  cpp: { badge: 'c++', title: 'Плюсовик', lang: 'C++' },
  rb: { badge: 'rb', title: 'Рубинщик', lang: 'Ruby' },
  swift: { badge: 'sw', title: 'Стриж', lang: 'Swift' },
  sh: { badge: 'sh', title: 'Шелловик', lang: 'Bash' },
  docker: { badge: 'dkr', title: 'Докер-мастер', lang: 'Dockerfile' },
  yaml: { badge: 'ci', title: 'Пайплайнщик', lang: 'CI-конфиге' },
}

export function langAchievement(stack: Stack): string {
  return `lang-${stack}`
}

const LANG_ACHIEVEMENTS: Achievement[] = STACKS.map((stack) => ({
  id: langAchievement(stack),
  icon: 'file-code',
  badge: LANGS[stack].badge,
  title: LANGS[stack].title,
  desc: `Поймать подлянку в ${LANGS[stack].lang}`,
}))

/** Пороги счётчика пойманных подлянок. */
export const FOUND_STEPS = [10, 25, 50, 100] as const

const FOUND_ACHIEVEMENTS: Achievement[] = [
  { id: 'found10', icon: 'target', title: 'Десятка', desc: 'Поймать 10 подлянок' },
  { id: 'found25', icon: 'medal', title: 'Четверть сотни', desc: 'Поймать 25 подлянок' },
  { id: 'found50', icon: 'gavel', title: 'Полсотни', desc: 'Поймать 50 подлянок' },
  { id: 'found100', icon: 'siren', title: 'Сотня', desc: 'Поймать 100 подлянок' },
]

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', icon: 'eye', title: 'Первый улов', desc: 'Найти первую подлянку' },
  { id: 'fast', icon: 'zap', title: 'С первого взгляда', desc: 'Найти быстрее чем за 20 секунд' },
  { id: 'blitz', icon: 'timer', title: 'Молния', desc: 'Найти быстрее чем за 10 секунд' },
  { id: 'clean', icon: 'shield-check', title: 'Презумпция', desc: 'Правильно апрувнуть чистый код' },
  { id: 'mutation', icon: 'shuffle', title: 'Мутатор', desc: 'Поймать мутацию пропса' },
  { id: 'streak3', icon: 'flame', title: 'Три подряд', desc: 'Три найденные подлянки подряд' },
  { id: 'streak10', icon: 'sparkles', title: 'Серия', desc: 'Десять найденных подлянок подряд' },
  ...FOUND_ACHIEVEMENTS,
  ...LANG_ACHIEVEMENTS,
  { id: 'perfect', icon: 'trophy', title: 'Чистая проверка', desc: 'Пройти день без пропусков' },
  { id: 'night', icon: 'alarm-clock', title: 'Ночная смена', desc: 'Продержаться 12 раундов в бесконечном' },
  { id: 'week', icon: 'calendar-check', title: 'Неделя', desc: 'Семь дней подряд' },
  { id: 'staff', icon: 'crown', title: 'Стафф', desc: 'Набрать 9000 очков за всё время' },
  { id: 'polyglot', icon: 'infinity', title: 'Полиглот', desc: 'Поймать подлянку на всех языках пака' },
  { id: 'collector', icon: 'award', title: 'Коллекционер', desc: 'Получить все остальные ачивки' },
]

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

/** Сколько из списка получено. Чужие id из старых сохранений не считаем. */
export function ownedCount(unlocked: readonly string[]): number {
  return ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length
}

/** Порог ачивки «Стафф» — он же верхний ранг. */
export const STAFF_XP = 9000

const FAST_SECONDS = 20
const BLITZ_SECONDS = 10
const STREAK = 3
const LONG_STREAK = 10
const NIGHT_ROUNDS = 12
const WEEK = 7

export interface RoundContext {
  task: Task
  outcome: Outcome
  /** Сколько секунд ушло на раунд. */
  spent: number
  /** Побед подряд, включая текущую. */
  foundStreak: number
  /** Общий опыт после этого раунда. */
  lifetime: number
  /** Всего пойманных подлянок за всё время, включая текущую. */
  found: number
}

/** Что открылось по итогам раунда. Дальше вызывающий отсеет уже полученные. */
export function roundUnlocks(ctx: RoundContext): string[] {
  const { task, outcome, spent, foundStreak, lifetime, found } = ctx
  const ids: string[] = []

  if (outcome === 'found') {
    ids.push('first')
    if (spent < FAST_SECONDS) ids.push('fast')
    if (spent < BLITZ_SECONDS) ids.push('blitz')
    ids.push(langAchievement(task.stack))
    if (task.bugs.some((b) => b.tag === 'props-mutated-in-place')) ids.push('mutation')

    for (const step of FOUND_STEPS) if (found >= step) ids.push(`found${step}`)
  }

  if (outcome === 'clean-correct') ids.push('clean')
  if (foundStreak >= STREAK) ids.push('streak3')
  if (foundStreak >= LONG_STREAK) ids.push('streak10')
  if (lifetime >= STAFF_XP) ids.push('staff')

  return ids
}

export interface RunContext {
  mode: string
  outcomes: readonly Outcome[]
  /** Дней подряд после этого захода. Считается только у дневной серии. */
  streak: number
}

/** Что открылось по итогам серии. Чистая проверка — только в дневном челлендже. */
export function runUnlocks({ mode, outcomes, streak }: RunContext): string[] {
  const ids: string[] = []

  if (mode === 'daily') {
    const perfect =
      outcomes.length > 0 && outcomes.every((o) => o === 'found' || o === 'clean-correct')
    if (perfect) ids.push('perfect')
    if (streak >= WEEK) ids.push('week')
  }

  if (mode === 'endless' && outcomes.length >= NIGHT_ROUNDS) ids.push('night')

  return ids
}

/**
 * Ачивки, которые считаются от других ачивок. Их нельзя выдать вместе
 * с раундом: сначала в список должно попасть всё остальное, поэтому
 * вызывающий прогоняет это уже по обновлённому списку — и повторяет,
 * пока список не перестанет расти («полиглот» открывает «коллекционера»).
 */
export function derivedUnlocks(unlocked: readonly string[]): string[] {
  const ids: string[] = []

  if (STACKS.every((s) => unlocked.includes(langAchievement(s)))) ids.push('polyglot')
  if (ACHIEVEMENTS.every((a) => a.id === 'collector' || unlocked.includes(a.id))) {
    ids.push('collector')
  }

  return ids
}
