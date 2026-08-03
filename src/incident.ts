/**
 * Инцидент: что игрок видит, когда дефект догорел.
 *
 * Лог привязан к **тегу подлянки, а не к задаче**. Тег `cache-no-invalidation`
 * есть у нескольких задач разных языков, и «кэш отдаёт устаревшее» пишется
 * один раз на всех. Иначе на каждую задачу пака пришлось бы писать свой лог,
 * и дополнение упёрлось бы в контент ещё до первой сыгранной смены.
 *
 * Диагностика — это шаг «почему» наоборот: варианты не «что не так», а «чей
 * это PR». Правильный ответ ровно один, остальные — настоящие мёрджи этой же
 * смены, поэтому угадать по формулировке нельзя, только вспомнить.
 *
 * Спецификация — `incident.test.ts`.
 * См. заметку «Дополнение — Ревью за ИИ», милестоун M4.
 */

import { fnv1a } from './daily.ts'
import type { Defect } from './defects.ts'
import { SUSPECTS, type ShiftEvent } from './shift.ts'

/** Лог инцидента. Контент, лежит отдельно от кода — как `reasons.json`. */
export interface IncidentLog {
  /** Тег подлянки, к которой лог привязан. */
  tag: string
  /** Строки лога, как они лягут в моноширинный блок. */
  lines: string
  /** Что видно на графике — одной строкой, необязательно. */
  metric?: string
}

/** Вариант ответа в диагностике: «какой PR это сделал». */
export interface Suspect {
  pr: number
  task: string
  turn: number
  right: boolean
}

/** Сид дефекта: один и тот же пропуск читается одинаково при перерисовке. */
function seed(defect: Defect, salt: string | number = ''): number {
  return fnv1a(`incident:${defect.task}:${defect.pr}:${salt}`)
}

/**
 * Лог под сработавший дефект. Нет лога на этот тег — null: показать общий
 * алерт решает интерфейс, придумывать текст здесь нечему.
 */
export function logFor(defect: Defect, logs: readonly IncidentLog[]): IncidentLog | null {
  const candidates = logs.filter((l) => l.tag === defect.tag)
  if (candidates.length === 0) return null

  return candidates[seed(defect) % candidates.length]
}

/**
 * Варианты для диагностики: виновный PR плюс другие мёрджи смены.
 *
 * Порядок детерминирован от дефекта — при перерисовке варианты не прыгают,
 * но и не стоят по времени: иначе виновный всегда оказывается самым старым
 * в списке, и после третьего инцидента лог перестают читать.
 */
export function suspects(
  defect: Defect,
  log: readonly ShiftEvent[],
  count: number = SUSPECTS,
): Suspect[] {
  const merged = log.filter((e) => e.kind === 'merged')

  // Виновного берём из журнала, если он там есть: у события точнее название
  // задачи и номер хода. Дефект — запасной источник, а не основной.
  const event = merged.find((e) => e.pr === defect.pr)
  const guilty: Suspect = {
    pr: defect.pr,
    task: event?.task ?? defect.task,
    turn: event?.turn ?? defect.merged,
    right: true,
  }

  const others: Suspect[] = merged
    .filter((e) => e.pr !== defect.pr)
    .sort((a, b) => b.turn - a.turn)
    .slice(0, Math.max(0, count - 1))
    .map((e) => ({ pr: e.pr, task: e.task, turn: e.turn, right: false }))

  return [guilty, ...others].sort((a, b) => seed(defect, a.pr) - seed(defect, b.pr))
}
