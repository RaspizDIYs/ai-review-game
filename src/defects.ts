/**
 * Скрытые дефекты — то, что осталось в проде после ревью.
 *
 * Пропущенная подлянка не наказывает сразу. Она ложится в прод и ждёт: каждый
 * ход укорачивается фитиль, и через несколько ходов приходит алерт. Задержка
 * здесь не украшение, а весь смысл: ошибку ревью замечают не в момент ревью,
 * и игрок должен увидеть последствие тогда, когда про этот PR уже забыл.
 *
 * Пока дефект лежит тихо, он всё равно течёт — медленно ест здоровье прода.
 * Так «ничего же не упало» перестаёт означать «всё хорошо».
 *
 * Всё детерминировано хэшем от id задачи и номера PR: одна и та же ошибка
 * в одном и том же месте даёт один и тот же дефект. Случайности здесь нет
 * специально — иначе разбор в конце смены нечем объяснить.
 *
 * См. заметку «Дополнение — Ревью за ИИ».
 */

import { fnv1a } from './daily.ts'
import type { Outcome, Task } from './types'

export interface Defect {
  /** Задача, из которой он родился. */
  task: string
  /** Номер PR, на котором его пропустили: по нему алерт называет виновного. */
  pr: number
  /** Ход смены, на котором он уехал в прод. */
  merged: number
  /** Тег подлянки — по нему подбирается лог инцидента. */
  tag: string
  /** Сколько здоровья снимет, когда сработает. 1..5. */
  weight: number
  /** Ходов до срабатывания. У известного не тикает: он уже рванул. */
  fuse: number
  /** Сколько здоровья съедает каждый ход, пока лежит тихо. */
  leak: number
  /**
   * Рвануло ли уже. Скрытый дефект тикает и тихо течёт, известный — течёт
   * сильнее и не проходит сам: его надо опознать среди своих мёрджей
   * и вылечить. Вслепую это и есть основная работа.
   */
  known: boolean
}

/** Границы фитиля. Меньше двух — игрок не успевает забыть, больше шести — не свяжет. */
const FUSE_MIN = 2
const FUSE_MAX = 6

/** Утечка по весу дефекта. Цифры — гипотеза, калибруются на игроках. */
const LEAK = [0.3, 0.45, 0.6, 0.8, 1.0]

/**
 * Во сколько раз известная мина течёт сильнее скрытой. Она уже сломала
 * что-то в проде и продолжает ломать, пока её не вылечат, — а вылечить
 * можно, только правильно опознав. Отсюда всё давление слепого режима.
 */
const KNOWN_LEAK = 2.2

/** Доработкой лечится примерно две трети попаданий. */
const REWORK_FAILS_EVERY = 3

/** Полный пропуск или частичный — часть подлянки всё равно уехала в прод. */
export function leavesDefect(outcome: Outcome): boolean {
  return outcome === 'missed' || outcome === 'partial'
}

/**
 * Что уехало в прод после раунда. null — ничего: подлянку нашли целиком,
 * либо это был чистый PR, либо игрок зря заблокировал мёрдж (за это платит
 * скорость, а не здоровье).
 */
export function born(
  task: Task,
  outcome: Outcome,
  pr: number,
  turn: number,
  /** Соль сида: мина, сломанная при починке, не должна повторять исходную. */
  salt = '',
): Defect | null {
  if (!leavesDefect(outcome)) return null
  // У чистой задачи подлянки нет по определению: пропускать нечего.
  if (task.clean || task.bugs.length === 0) return null

  // Частично найденная подлянка бьёт слабее целиком пропущенной: часть игрок
  // всё-таки снял, и это должно быть видно не только в очках.
  const weight = Math.max(1, Math.min(5, task.difficulty - (outcome === 'partial' ? 1 : 0)))
  const seed = fnv1a(`defect:${task.id}:${pr}:${salt}`)

  return {
    task: task.id,
    pr,
    merged: turn,
    tag: task.bugs[0].tag,
    weight,
    fuse: FUSE_MIN + (seed % (FUSE_MAX - FUSE_MIN + 1)),
    leak: LEAK[weight - 1],
    known: false,
  }
}

export interface Tick {
  /** Всё, что лежит в проде после хода, — и скрытое, и известное. */
  defects: Defect[]
  /** Рвануло именно на этом ходу — из них рождаются алерты. */
  fired: Defect[]
  /** Суммарная утечка за ход. */
  leak: number
}

/**
 * Ход смены. У скрытых укорачивается фитиль, догоревшие становятся известными
 * и остаются лежать: сработавшую мину ещё надо опознать среди своих мёрджей.
 *
 * Утечку берут все, кроме рванувшего именно сейчас: он платит своим весом,
 * и брать с него ещё и за тихую жизнь было бы двойным счётом.
 */
export function tick(defects: readonly Defect[]): Tick {
  const out: Defect[] = []
  const fired: Defect[] = []
  let leak = 0

  for (const defect of defects) {
    if (defect.known) {
      out.push(defect)
      leak += defect.leak * KNOWN_LEAK
      continue
    }

    const next = { ...defect, fuse: defect.fuse - 1 }
    if (next.fuse <= 0) {
      next.known = true
      fired.push(next)
      out.push(next)
      continue
    }

    out.push(next)
    leak += next.leak
  }

  return { defects: out, fired, leak: Math.round(leak * 100) / 100 }
}

export interface FixResult {
  defects: Defect[]
  /** Попал ли игрок в тот самый PR. Ему это не сообщается. */
  hit: boolean
}

/**
 * Откат: если в проде лежит мина этого PR — её больше нет. Если нет,
 * то фича потеряна впустую, а прод остался как был.
 */
export function rollback(defects: readonly Defect[], pr: number): FixResult {
  const guilty = defects.find((d) => d.pr === pr)
  return guilty
    ? { defects: without(defects, guilty), hit: true }
    : { defects: [...defects], hit: false }
}

/**
 * Доработка: дешевле отката, но лечит не всегда — ИИ правит по описанию
 * симптома и не всегда правит то место. Промах детерминирован от дефекта,
 * чтобы одна и та же ошибка не лечилась по-разному при перерисовке.
 */
export function rework(defects: readonly Defect[], pr: number): FixResult {
  const guilty = defects.find((d) => d.pr === pr)
  if (!guilty) return { defects: [...defects], hit: false }

  const lucky = fnv1a(`rework:${guilty.task}:${guilty.pr}`) % REWORK_FAILS_EVERY !== 0
  return lucky ? { defects: without(defects, guilty), hit: true } : { defects: [...defects], hit: false }
}

/** Сумма весов — она же «долг»: сколько мин лежит в проде прямо сейчас. */
export function debt(defects: readonly Defect[]): number {
  return defects.reduce((sum, d) => sum + d.weight, 0)
}

/**
 * Кого убирает плановая уборка. Самый лёгкий дефект, при равном весе — самый
 * старый: уборка разгребает накопившееся, а не тушит то, что вот-вот рванёт.
 */
export function weakest(defects: readonly Defect[]): Defect | null {
  if (defects.length === 0) return null

  return defects.reduce((best, d) =>
    d.weight < best.weight || (d.weight === best.weight && d.merged < best.merged) ? d : best,
  )
}

/** Убрать дефект из прода — уборкой или правильным фиксом. */
export function without(defects: readonly Defect[], target: Defect): Defect[] {
  const i = defects.indexOf(target)
  return i < 0 ? [...defects] : [...defects.slice(0, i), ...defects.slice(i + 1)]
}
