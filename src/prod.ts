/**
 * Жизнеспособность прода. Три шкалы, потому что одной мало: она не отличает
 * «тихо гниёт» от «горит прямо сейчас» и не видит противоположной ошибки.
 *
 * - **здоровье** — переживёт ли прод эту смену;
 * - **долг** — сколько мин в нём лежит (считается из дефектов, отдельно
 *   не хранится: два источника правды разъезжаются);
 * - **скорость** — довольна ли команда тем, как быстро едут PR.
 *
 * Скорость нужна обязательно. Без неё выигрышная стратегия — блокировать
 * всё подряд, и игра ломается ровно так, как описано в заметке
 * «Чистые раунды обязательны»: цена перестраховки должна быть настоящей.
 *
 * Отсюда главная сделка смены: **пропуск даёт скорость сейчас и отнимает
 * здоровье потом**. Апрувнул PR с подлянкой — команда довольна, дефект уехал
 * в прод и рванёт через несколько ходов. Заблокировал — переделка стоит
 * времени, зато прод чист.
 *
 * Цифры ниже — скелет для первой сборки, а не баланс. Ни одна не проверена
 * на живых игроках. Ориентир для калибровки: смена при среднем ревью должна
 * заканчиваться со здоровьем около сорока.
 *
 * См. заметку «Дополнение — Ревью за ИИ».
 */

import { debt, type Defect, type Tick } from './defects.ts'
import type { Outcome } from './types'

export interface Prod {
  /** 0..100. Ноль — прод не пережил смену. */
  health: number
  /** 0..100. Ноль — тебя сняли с ревью: ничего не едет. */
  velocity: number
}

export const MAX_HEALTH = 100
export const MAX_VELOCITY = 100

/** Скорость стартует не с потолка: расти должно быть куда, падать — откуда. */
export const START: Prod = { health: MAX_HEALTH, velocity: 60 }

/** Сколько здоровья возвращает один ход плановой уборки. */
export const CLEANUP_HEAL = 5

/**
 * Что раунд делает со скоростью.
 *
 * Правильно заблокированный PR не стоит доверия — он стоит хода, и этого
 * достаточно: наказывать за найденную подлянку значит наказывать за работу.
 * Проверено прогоном: при −1 за находку идеальный ревьюер медленно, но верно
 * доезжал до увольнения, а это заведомо сломанное правило.
 *
 * Сделка остаётся в разнице: смёрженный PR даёт +4, заблокированный — ноль.
 * А обвинение чистого стоит дорого: заблокирована нормальная работа,
 * и оправдания «я перестраховался» не принимаются.
 */
const VELOCITY: Record<Outcome, number> = {
  missed: +4,
  'clean-correct': +4,
  partial: +2,
  found: 0,
  'false-accusation': -6,
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value * 100) / 100))
}

export function afterRound(prod: Prod, outcome: Outcome): Prod {
  return { ...prod, velocity: clamp(prod.velocity + VELOCITY[outcome], MAX_VELOCITY) }
}

/** Сколько здоровья снимает падение прода по весу дефекта. Гипотеза. */
const BLAST = [6, 10, 15, 20, 25]

/**
 * Повторное падение по той же причине дешевле первого — но не бесплатно.
 *
 * Полная цена каждый ход убивала любого, кто не опознал причину с первой
 * попытки: прогон показал 45% сгоревших смен у среднего ревьюера против 1%
 * у хорошего. Такой обрыв — не сложность, а лотерея. Половинная цена
 * оставляет несколько ходов на то, чтобы всё-таки найти виноватого.
 */
const REPEAT = 0.5

export function blastOf(defect: Defect): number {
  const full = BLAST[defect.weight - 1]
  return defect.crashes > 1 ? Math.round(full * REPEAT) : full
}

/**
 * Итог хода: сработавшие дефекты бьют своим весом, оставшиеся тихо текут.
 * Здоровье считается только здесь — чтобы был ровно один вход в шкалу.
 */
export function afterTick(prod: Prod, { fired, leak }: Tick): Prod {
  const blast = fired.reduce((sum, d) => sum + blastOf(d), 0)
  return { ...prod, health: clamp(prod.health - blast - leak, MAX_HEALTH) }
}

/** Неудачная починка стоит здоровья: правку выкатили, легче не стало. */
const REPAIR_MISS = 4
const REPAIR_BROKE = 8

/**
 * Итог починки. Удачная возвращает половину того, что мина успела снять,
 * — но не больше: сломанное в проде не отменяется задним числом.
 */
export function afterRepair(
  prod: Prod,
  result: 'cured' | 'failed' | 'broke',
  defect: Defect | undefined,
): Prod {
  if (result === 'cured') {
    const back = defect ? blastOf(defect) / 2 : CLEANUP_HEAL
    return { ...prod, health: clamp(prod.health + back, MAX_HEALTH) }
  }

  const cost = result === 'broke' ? REPAIR_BROKE : REPAIR_MISS
  return { ...prod, health: clamp(prod.health - cost, MAX_HEALTH) }
}

export function afterCleanup(prod: Prod): Prod {
  return { ...prod, health: clamp(prod.health + CLEANUP_HEAL, MAX_HEALTH) }
}

/** Закрытый инцидент возвращает половину того, что снял. */
export function afterIncidentClosed(prod: Prod, defect: Defect): Prod {
  return { ...prod, health: clamp(prod.health + blastOf(defect) / 2, MAX_HEALTH) }
}

export type Verdict = 'alive' | 'burned' | 'fired'

/**
 * Чем кончилась смена. Два разных проигрыша, и путать их нельзя: сгоревший
 * прод и снятие с ревью — это про противоположные ошибки, и игрок должен
 * понять, какую из них он сделал.
 */
export function verdict(prod: Prod): Verdict {
  if (prod.health <= 0) return 'burned'
  if (prod.velocity <= 0) return 'fired'
  return 'alive'
}

export function isOver(prod: Prod): boolean {
  return verdict(prod) !== 'alive'
}

/**
 * Сводка смены. Долг считается из дефектов на руках, а не копится параллельно.
 */
export interface Summary {
  prod: Prod
  verdict: Verdict
  /** Сколько мин осталось в проде. */
  debt: number
  defects: number
}

export function summarize(prod: Prod, defects: readonly Defect[]): Summary {
  return { prod, verdict: verdict(prod), debt: debt(defects), defects: defects.length }
}
