/**
 * Ранг по накопленному опыту. Единственное, что растёт вместе с игроком
 * между заходами: очки за раунд забываются, «Мидл» — нет.
 *
 * Названия те же, что у уровней подборки, и это намеренно: уровень — на что
 * ты подписался сегодня, ранг — сколько ты уже отсмотрел.
 */

import type { IconName } from './ui/icons.tsx'

export interface Rank {
  title: string
  at: number
  icon: IconName
}

export const RANKS: Rank[] = [
  { title: 'Стажёр', at: 0, icon: 'graduation-cap' },
  { title: 'Джун', at: 800, icon: 'sprout' },
  { title: 'Мидл', at: 2000, icon: 'hammer' },
  { title: 'Сеньор', at: 4500, icon: 'medal' },
  { title: 'Стафф', at: 9000, icon: 'crown' },
]

export interface RankState {
  title: string
  level: number
  icon: IconName
  /** Прогресс до следующего ранга, 0–100. На верхнем — 100. */
  pct: number
  hint: string
}

export function rank(lifetime: number): RankState {
  let i = 0
  for (let k = 0; k < RANKS.length; k++) if (lifetime >= RANKS[k].at) i = k

  const next = RANKS[i + 1]
  const from = RANKS[i].at
  const pct = next ? Math.round(((lifetime - from) / (next.at - from)) * 100) : 100

  return {
    title: RANKS[i].title,
    level: i + 1,
    icon: RANKS[i].icon,
    pct: Math.max(0, Math.min(100, pct)),
    hint: next
      ? `${next.at - lifetime} опыта до «${next.title}»`
      : 'потолок взят — выше только выгорание',
  }
}
