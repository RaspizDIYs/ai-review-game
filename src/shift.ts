/**
 * Смена — режим, в котором раунд ревью перестаёт быть отдельной задачей
 * и становится ходом. Ход — одно действие: отревьюить PR либо разгрести долг.
 *
 * Здесь только состояние и переходы, без экранов: смена должна проверяться
 * тестами, а не кликами, — по той же причине, по которой из компонента
 * вынесен `round.ts`.
 *
 * Порядок внутри хода фиксирован и важен:
 *
 *   1. действие игрока (ревью или уборка) — меняет скорость и список дефектов;
 *   2. тик прода — фитили укорачиваются, догоревшие рвутся;
 *   3. дефект, родившийся на этом ходу, кладётся в прод ПОСЛЕ тика.
 *
 * Третий пункт — не мелочь. Если новый дефект попадает под тик того же хода,
 * фитиль «2» фактически означает 1, и обещание «через два хода» врёт.
 *
 * Спецификация — `shift.test.ts`.
 * См. заметку «Дополнение — Ревью за ИИ», милестоун M4.
 */

import { born, tick, weakest, without, type Defect } from './defects.ts'
import { PR_BASE } from './pr.ts'
import {
  afterCleanup,
  afterRepair,
  afterRound,
  afterTick,
  isOver as prodIsOver,
  START,
  summarize,
  type Prod,
  type Summary,
} from './prod.ts'
import type { Outcome, Task } from './types'

/** Ходов в смене. Гипотеза, калибруется на игроках. */
export const SHIFT_TURNS = 14

/** Сколько последних мёрджей показывается в диагностике инцидента. */
export const SUSPECTS = 4

/**
 * Уборок на смену. Раньше их было сколько угодно, и ход уборки был просто
 * пропуском с гарантированной пользой — самый выгодный ход в игре. Теперь это
 * ограниченный ресурс: три штуки, каждая закрывает одну тихую мину наверняка.
 */
export const CLEANUPS = 3

/**
 * Что случилось на ходу. Журнал нужен не для красоты: из него собирается
 * сводка смены и список подозреваемых, когда приходит алерт.
 */
export type ShiftEvent =
  | { kind: 'merged'; turn: number; pr: number; task: string; outcome: Outcome }
  | { kind: 'blocked'; turn: number; pr: number; task: string; outcome: Outcome }
  | {
      kind: 'incident'
      turn: number
      /** PR, на котором дефект пропустили. */
      pr: number
      task: string
      tag: string
      weight: number
      /** Ход, на котором его смёржили, — чтобы алерт мог это назвать. */
      merged: number
    }
  | {
      kind: 'cleanup'
      turn: number
      /** Какой дефект разгребли; null — прод был чист. */
      task: string | null
      /**
       * Чей PR закрыла уборка. Да, это подсказка: игрок узнаёт, что вот в этом
       * мёрдже была подлянка. Так и задумано — заряд уборки для того и тратят,
       * чтобы получить не только здоровье, но и вычеркнутую строку в списке.
       */
      pr: number | null
    }
  | {
      kind: 'repair'
      turn: number
      /** Какой PR игрок полез чинить. */
      pr: number
      /** Чем кончилось. В журнале лежит, но игроку до разбора не показывается. */
      result: RepairResult
    }

export interface Shift {
  /** Текущий ход, с нуля. */
  turn: number
  turns: number
  /** Номер следующего PR. */
  pr: number
  prod: Prod
  defects: Defect[]
  log: ShiftEvent[]
  /**
   * На сколько изменилось здоровье на прошлом ходу. Вслепую это единственная
   * подсказка: числа мин игроку не показывают, он читает наклон.
   */
  delta: number
  /** Сколько уборок осталось. Единственная валюта, которую видно целиком. */
  cleanups: number
}

/**
 * Чем кончилась попытка починить своими руками.
 *
 * `cured` — разметил ровно те строки, что были подлянкой: мины больше нет.
 * `failed` — не туда: мина осталась, а время и здоровье потрачены.
 * `broke` — полез в код, где подлянки не было, и «поправил» его. Самая
 *   дорогая ошибка: в проде появляется новая мина, которой там не было.
 */
export type RepairResult = 'cured' | 'failed' | 'broke'

export interface Repair extends Turn {
  result: RepairResult
}

/** Результат хода: новая смена и то, что рвануло, — из этого строится алерт. */
export interface Turn {
  shift: Shift
  fired: Defect[]
}

/** Что переносится в следующую смену: прод не начинается с чистого листа. */
export interface Carry {
  prod: Prod
  defects: readonly Defect[]
  pr: number
}

/** Заблокированный PR не мёржится — значит, и в прод ничего не уезжает. */
export function merges(outcome: Outcome): boolean {
  return outcome !== 'found' && outcome !== 'false-accusation'
}

/** Новая смена. Без `carry` — первая в жизни: прод здоров и пуст. */
export function start(carry?: Carry, turns: number = SHIFT_TURNS): Shift {
  return {
    turn: 0,
    turns,
    // Нумерация PR сквозная: репозиторий у игрока один, и номера в нём
    // не начинаются заново каждое утро.
    pr: carry?.pr ?? PR_BASE,
    prod: carry?.prod ?? START,
    defects: carry ? [...carry.defects] : [],
    log: [],
    delta: 0,
    // Уборки не переносятся: каждая смена начинается с трёх.
    cleanups: CLEANUPS,
  }
}

/** Шаг здоровья за ход — с округлением, иначе в интерфейс лезет 0.30000000004. */
function step(before: Prod, after: Prod): number {
  return Math.round((after.health - before.health) * 100) / 100
}

/** Сработавшие дефекты — в журнал. Их адрес и есть содержание алерта. */
function incidents(turn: number, fired: readonly Defect[]): ShiftEvent[] {
  return fired.map((d) => ({
    kind: 'incident',
    turn,
    pr: d.pr,
    task: d.task,
    tag: d.tag,
    weight: d.weight,
    merged: d.merged,
  }))
}

/** Ход ревью: игрок ответил на PR. */
export function review(shift: Shift, task: Task, outcome: Outcome): Turn {
  const action: ShiftEvent = {
    kind: merges(outcome) ? 'merged' : 'blocked',
    turn: shift.turn,
    pr: shift.pr,
    task: task.id,
    outcome,
  }

  // Тикают только те, кто уже лежал в проде: новый дефект ждёт следующего хода.
  const ticked = tick(shift.defects)
  const fresh = born(task, outcome, shift.pr, shift.turn)
  const prod = afterTick(afterRound(shift.prod, outcome), ticked)

  return {
    shift: {
      turn: shift.turn + 1,
      turns: shift.turns,
      pr: shift.pr + 1,
      prod,
      defects: fresh ? [...ticked.defects, fresh] : ticked.defects,
      log: [...shift.log, action, ...incidents(shift.turn, ticked.fired)],
      delta: step(shift.prod, prod),
      cleanups: shift.cleanups,
    },
    fired: ticked.fired,
  }
}

/**
 * Починка своими руками. Кнопки «откатить» нет и не будет: игрок открывает
 * тот же диф заново и заново размечает строки. Попал — мины нет, не попал —
 * мина на месте, а если полез в здоровый код, то и сломал его.
 *
 * Ход смены на это не тратится — чинят уже после смены. Но время в проде
 * идёт: фитили тикают, и пока возишься с одним, дотикает соседнее.
 *
 * `outcome` приходит из обычного разбора отправки (`resolveSubmit`): чинить
 * и ревьюить — это буквально одно и то же действие, отличается только смысл.
 */
export function repair(shift: Shift, pr: number, task: Task, outcome: Outcome): Repair {
  const guilty = shift.defects.find((d) => d.pr === pr)
  const cured = guilty !== undefined && outcome === 'found'
  const result: RepairResult = cured ? 'cured' : guilty ? 'failed' : 'broke'

  // Сломать можно только то, во что полез: пустая отправка сюда не доходит.
  const broken = result === 'broke' ? born(task, 'missed', pr, shift.turn, 'repair') : null
  const rest = cured && guilty ? without(shift.defects, guilty) : shift.defects

  // Починка ход не тратит, поэтому и повторного падения на ней нет:
  // тикают только фитили тех, кто ещё лежит тихо.
  const ticked = tick(rest, false)
  const prod = afterTick(afterRepair(shift.prod, result, guilty), ticked)

  return {
    shift: {
      turn: shift.turn,
      turns: shift.turns,
      pr: shift.pr,
      prod,
      defects: broken ? [...ticked.defects, broken] : ticked.defects,
      log: [
        ...shift.log,
        { kind: 'repair', turn: shift.turn, pr, result },
        ...incidents(shift.turn, ticked.fired),
      ],
      delta: step(shift.prod, prod),
      cleanups: shift.cleanups,
    },
    fired: ticked.fired,
    result,
  }
}

/**
 * Уборка: закрыть одну тихую мину наверняка.
 *
 * Тратит заряд, а не ход. Раньше было наоборот — и получалась нелепость:
 * на ходу падает прод, поэтому кнопка «разгрести долг» обещала плюс здоровья,
 * а показывала минус. Трёх зарядов на смену достаточно, чтобы уборка не стала
 * бесплатной, а ход для этого не нужен.
 *
 * Скорость уборка не трогает: команда не замечает, что кто-то починил то,
 * что ещё не сломалось.
 */
export function cleanup(shift: Shift): Turn {
  // Заряды кончились — ничего не происходит.
  if (shift.cleanups <= 0) return { shift, fired: [] }

  const target = weakest(shift.defects)
  const prod = afterCleanup(shift.prod)
  const action: ShiftEvent = {
    kind: 'cleanup',
    turn: shift.turn,
    task: target?.task ?? null,
    pr: target?.pr ?? null,
  }

  return {
    shift: {
      ...shift,
      prod,
      defects: target ? without(shift.defects, target) : shift.defects,
      log: [...shift.log, action],
      delta: step(shift.prod, prod),
      cleanups: shift.cleanups - 1,
    },
    fired: [],
  }
}

/** Смена кончилась: вышли ходы либо прод не пережил. */
export function isShiftOver(shift: Shift): boolean {
  return shift.turn >= shift.turns || prodIsOver(shift.prod)
}

export function finish(shift: Shift): Summary {
  return summarize(shift.prod, shift.defects)
}

/** Последние смёрженные PR, новые первыми. Заблокированные в счёт не идут. */
export function merged(shift: Shift, count: number = SUSPECTS): ShiftEvent[] {
  return shift.log
    .filter((e) => e.kind === 'merged')
    .sort((a, b) => b.turn - a.turn)
    .slice(0, count)
}

/** Что перенести в следующую смену. */
export function carry(shift: Shift): Carry {
  return { prod: shift.prod, defects: shift.defects, pr: shift.pr }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDefect(value: unknown): value is Defect {
  return (
    isObject(value) &&
    typeof value.task === 'string' &&
    typeof value.tag === 'string' &&
    isNumber(value.pr) &&
    isNumber(value.merged) &&
    isNumber(value.weight) &&
    isNumber(value.fuse) &&
    isNumber(value.leak)
  )
}

const KINDS: ShiftEvent['kind'][] = ['merged', 'blocked', 'incident', 'cleanup', 'repair']

function isEvent(value: unknown): value is ShiftEvent {
  return isObject(value) && isNumber(value.turn) && KINDS.includes(value.kind as ShiftEvent['kind'])
}

/**
 * Восстановление смены из localStorage. Всё, что не похоже на смену, —
 * выбрасываем молча: это игровой прогресс, а не данные, ради которых
 * стоит писать миграции (см. `storage.ts`).
 */
export function restore(raw: unknown): Shift | null {
  if (!isObject(raw)) return null

  const { turn, turns, pr, prod, defects, log } = raw
  if (!isNumber(turn) || !isNumber(turns) || !isNumber(pr)) return null
  if (!isObject(prod) || !isNumber(prod.health) || !isNumber(prod.velocity)) return null
  if (!Array.isArray(defects) || !defects.every(isDefect)) return null
  if (!Array.isArray(log) || !log.every(isEvent)) return null

  return {
    turn,
    turns,
    pr,
    prod: { health: prod.health, velocity: prod.velocity },
    defects,
    log,
    // Сохранения до слепого режима шага здоровья не знают — начнём с нуля.
    delta: isNumber(raw.delta) ? raw.delta : 0,
    cleanups: isNumber(raw.cleanups) ? raw.cleanups : CLEANUPS,
  }
}
