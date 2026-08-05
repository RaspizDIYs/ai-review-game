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
  /** Сколько раз уже уронил прод. Первое падение самое дорогое. */
  crashes: number
}

/**
 * Границы фитиля. Меньше двух — игрок не успевает забыть, больше пяти —
 * на смене в двенадцать ходов мина просто не успевает рвануть и уезжает
 * в следующую смену, где связать её с мёрджем уже нечем.
 */
const FUSE_MIN = 2
const FUSE_MAX = 5

/**
 * Утечка по весу дефекта: сколько здоровья съедает мина, пока лежит тихо.
 *
 * 04.08 поднята примерно втрое. Это единственная цена, которую нельзя
 * отыграть диагностикой: упавшую мину чинят, тихая просто течёт, — и именно
 * она делает осмысленными сверку и уборку. При прежних 0.3–1.0 долг из трёх
 * мин стоил меньше одного удачного ремонта.
 */
const LEAK = [0.8, 1.1, 1.5, 1.9, 2.4]

/** Доработкой лечится примерно две трети попаданий. */
const REWORK_FAILS_EVERY = 3

/**
 * Состояние прода без чисел.
 *
 * Игрок не должен знать, сколько мин в проде, — но обязан понимать, есть ли
 * они вообще и горит ли прямо сейчас. Это разные вещи: подтекающий прод
 * доживёт до конца смены, падающий — нет.
 */
export type ProdState = 'clean' | 'leaking' | 'falling'

export function state(defects: readonly Defect[]): ProdState {
  if (defects.some((d) => d.known)) return 'falling'
  return defects.length > 0 ? 'leaking' : 'clean'
}

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
    crashes: 0,
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
 * Ход смены.
 *
 * У скрытых укорачивается фитиль: они лежат тихо и понемногу текут. Догорел —
 * прод упал, и мина становится известной.
 *
 * Известная **роняет прод каждый ход**, пока её не починят руками. Это и есть
 * разница между «подтекает» и «горит»: с подтекающим продом смену дожить
 * можно, с падающим — нет, критическую ошибку обязательно чинить.
 *
 * Утечку берут только те, кто лежит тихо: упавший платит своим весом, и брать
 * с него ещё и за тихую жизнь было бы двойным счётом.
 */
export function tick(defects: readonly Defect[], crash = true): Tick {
  const out: Defect[] = []
  const fired: Defect[] = []
  let leak = 0

  for (const defect of defects) {
    if (defect.known) {
      // Пока игрок чинит, прод уже лежит — падать заново ему незачем.
      // Иначе каждая попытка стоила бы полного падения, и чинить вслепую
      // становилось бы дороже, чем не чинить вовсе.
      if (!crash) {
        out.push(defect)
        continue
      }

      const again = { ...defect, crashes: defect.crashes + 1 }
      fired.push(again)
      out.push(again)
      continue
    }

    const next = { ...defect, fuse: defect.fuse - 1 }
    if (next.fuse <= 0) {
      next.known = true
      next.crashes = 1
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

/** Секунд отклика теряется на каждую единицу долга. Гипотеза, не проверено. */
const SLOWDOWN_PER_WEIGHT = 0.9

/**
 * Насколько прод стал медленнее. Единственная цифра, которую чекпойнт может
 * показать честно, ничего не выдав: она говорит, что мины есть, но не
 * говорит, в каком PR. «Здоровье 95, отклик +4.3 с» — этого достаточно,
 * чтобы понять, что что-то проскочило.
 */
export function slowdown(defects: readonly Defect[]): number {
  return Math.round(debt(defects) * SLOWDOWN_PER_WEIGHT * 10) / 10
}

/**
 * Кого убирает плановая уборка: самый лёгкий из тех, что лежат тихо, при
 * равном весе — самый старый.
 *
 * Упавший прод уборкой не чинится специально. Критическая ошибка на то и
 * критическая, что её надо найти руками среди своих мёрджей, — будь она
 * закрываема кнопкой, всё падение прода стоило бы одного клика.
 */
export function weakest(defects: readonly Defect[]): Defect | null {
  const quiet = defects.filter((d) => !d.known)
  if (quiet.length === 0) return null

  return quiet.reduce((best, d) =>
    d.weight < best.weight || (d.weight === best.weight && d.merged < best.merged) ? d : best,
  )
}

/** Убрать дефект из прода — уборкой или правильным фиксом. */
export function without(defects: readonly Defect[], target: Defect): Defect[] {
  const i = defects.indexOf(target)
  return i < 0 ? [...defects] : [...defects.slice(0, i), ...defects.slice(i + 1)]
}
