/**
 * Фаза починки: сверка посреди смены, упавший прод или разбор завалов
 * после смены. Экран один — меняется только повод.
 *
 * Кнопок «откатить» и «отправить на доработку» здесь нет и не будет: игрок
 * открывает свой же мёрдж заново, ищет в нём то, что проглядел, и размечает
 * строки руками. Починка и ревью — одно и то же действие, отличается смысл.
 *
 * **Разметка — черновик.** Раньше каждая правка считалась мгновенно: открыл
 * PR, ткнул строку, получил невидимый пересчёт здоровья, вернулся, ткнул
 * другую — и так до конца игры на одном пул-реквесте. Теперь отметки живут
 * в списке, их видно, их можно менять и снимать, а выкатываются они разом
 * по «работать дальше». Цена ошибки не исчезла — исчезла мясорубка.
 */

import type { ProdState } from '../defects.ts'
import { CLEANUPS, type ShiftEvent } from '../shift.ts'
import { plural } from '../stats.ts'
import { Icon } from '../ui/icons.tsx'
import { Button, Tip } from '../ui/kit.tsx'
import { diffStat } from '../diff.ts'
import { Gauges } from './Gauges.tsx'

interface Props {
  /** Все мёрджи, которые игрок пустил в прод. Какие из них с подлянкой — неизвестно. */
  merged: ShiftEvent[]
  titles: Map<string, string>
  /** Дифы задач по id — из них берётся статистика строк для карточки. */
  diffs: Map<string, string>
  /** PR, которые игрок закрыл своими руками: их код уже переписан. */
  fixed: Set<number>
  /** Сколько раз уже лазили в каждый PR — история попыток по каждому. */
  tried: Map<number, number>
  /** Черновик правок: PR → отмеченные строки. Считается на выходе. */
  drafts: Map<number, number[]>
  /** Шкалы прода: на этом экране они нужны так же, как в ходе смены. */
  prod: { health: number; velocity: number; delta: number; state: ProdState }
  /** Сколько здоровья вернула последняя уборка. 0 — разгребать было нечего. */
  healed: number | null
  accent: string
  /** Чиним прямо на упавшем проде, а не между сменами. */
  urgent: boolean
  /**
   * Плановая остановка каждые четыре хода: смотрим, каким стал прод, и решаем,
   * чинить сейчас или работать дальше. Правды тут нет — только здоровье
   * и отклик, см. `isCheckpoint` в `shift.ts`.
   */
  checkpoint: { turn: number; turns: number; day: number; slowdown: number } | null
  /** Сколько уборок осталось на смену. */
  cleanups: number
  onPick: (pr: number, task: string) => void
  onCleanup: () => void
  onDone: () => void
  /** Вернуться к разбору аварии. null — аварии сейчас нет. */
  onBackToIncident: (() => void) | null
  /** Уйти на главную. Смена сохраняется и ждёт возвращения. */
  onExit: () => void
}

export function RepairPick({
  merged,
  titles,
  diffs,
  fixed,
  tried,
  drafts,
  prod,
  healed,
  accent,
  urgent,
  checkpoint,
  cleanups,
  onPick,
  onCleanup,
  onDone,
  onBackToIncident,
  onExit,
}: Props) {
  const marked = [...drafts.values()].filter((lines) => lines.length > 0).length

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1
          className="font-display m-0 text-[clamp(20px,3.6vw,27px)] font-bold tracking-[-.02em]"
          style={{ color: urgent ? '#f87171' : '#f4f4f6' }}
        >
          {urgent ? 'Прод лежит' : checkpoint ? 'Сверка с продом' : 'Разбор завалов'}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          {checkpoint && (
            <span className="font-mono text-[11px] text-[#6b6b77]">
              день {checkpoint.day} · ход {checkpoint.turn}/{checkpoint.turns}
            </span>
          )}
          {/* Шкалы здесь те же, что и в ходе смены: раньше на починке они
              пропадали, и игрок правил прод, не видя, что с ним происходит. */}
          <Gauges
            health={prod.health}
            velocity={prod.velocity}
            delta={prod.delta}
            state={prod.state}
            accent={accent}
            compact
          />
          {/* Отклик — единственная цифра, которую можно показать вслепую:
              она говорит, что мины есть, но не говорит, в каком PR. */}
          {checkpoint && checkpoint.slowdown > 0 && (
            <Tip text="Мины в проде замедляют отклик. Сколько их — прод не скажет." side="bottom">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#6b6b77]">
                отклик
                <span className="text-[13px] font-bold text-[#f0a24b] tabular-nums">
                  +{checkpoint.slowdown.toFixed(1)} с
                </span>
              </span>
            </Tip>
          )}
        </div>
      </div>

      <p className="m-0 max-w-[680px] text-sm leading-[1.55] text-[#9a9aa4]">
        {urgent
          ? 'Вот всё, что ты пустил в прод. Причина падения — в одном из них. Время не идёт и попытки не считаются: пока прод лежит, ничего важнее нет.'
          : checkpoint
            ? 'Плановая сверка. Здоровье и отклик — вот и всё, что говорит прод; какой из мёрджей его портит, он не скажет. Можно починить сейчас, можно работать дальше.'
            : 'Вот всё, что ты пустил в прод за смену. Где-то здесь сидит то, что его ломает — а может, и нет.'}{' '}
        Открывай, размечай строки и возвращайся: отметки — черновик, менять их
        можно сколько угодно. Правки уедут все разом, когда нажмёшь «работать
        дальше».
      </p>

      <div className="flex flex-col gap-1.5">
        {merged.map((event) => {
          if (event.kind !== 'merged') return null
          const times = tried.get(event.pr) ?? 0
          const draft = drafts.get(event.pr) ?? []

          const done = fixed.has(event.pr)
          const { adds, dels } = diffStat(diffs.get(event.task) ?? '')

          return (
            <button
              key={event.pr}
              onClick={() => onPick(event.pr, event.task)}
              className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors hover:border-[#3a3a44]"
              style={{
                borderColor: done ? '#34d39955' : draft.length > 0 ? `${accent}66` : '#202027',
                background: done
                  ? 'rgba(16,185,129,.05)'
                  : draft.length > 0
                    ? `${accent}0d`
                    : '#101014',
              }}
            >
              <span style={{ color: done ? '#34d399' : draft.length > 0 ? accent : '#4a4a54' }}>
                <Icon
                  name={done ? 'check-check' : draft.length > 0 ? 'hammer' : 'git-pull-request'}
                  size={14}
                />
              </span>
              <span className="font-mono text-[11px] text-[#6b6b77]">#{event.pr}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#d8d8dd]">
                {titles.get(event.task) ?? event.task}
              </span>

              {/* Строчная статистика — как в списке пул-реквестов на гите. */}
              <span className="font-mono text-[11px] whitespace-nowrap tabular-nums">
                <span className="text-[#34d399]">+{adds}</span>{' '}
                <span className="text-[#f87171]">−{dels}</span>
              </span>

              {done ? (
                <span className="font-mono text-[10px] whitespace-nowrap text-[#34d399]">
                  переписан
                </span>
              ) : draft.length > 0 ? (
                <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: accent }}>
                  отмечено: {draft.join(', ')}
                </span>
              ) : times > 0 ? (
                <span className="font-mono text-[10px] whitespace-nowrap text-[#5c5c66]">
                  правил {times} {plural(times, 'раз', 'раза', 'раз')}
                </span>
              ) : null}

              <span className="font-mono text-[10px] whitespace-nowrap text-[#4a4a54]">
                ход {event.turn + 1}
              </span>
            </button>
          )
        })}
      </div>

      {/* Уборка живёт здесь же: разгребать долг логично там, где его и разбирают.
          Заряд тратится, ход — нет, поэтому здоровье от неё только растёт. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#26262c] bg-[#101014] px-4 py-3.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums"
          style={{
            color: cleanups > 0 ? accent : '#4a4a54',
            border: `2px solid ${cleanups > 0 ? accent : '#2a2a32'}`,
            background: cleanups > 0 ? `${accent}18` : 'transparent',
          }}
        >
          {cleanups}/{CLEANUPS}
        </span>

        <div className="min-w-[180px] flex-1">
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-[#d8d8dd]">
            Разгрести долг
            {healed !== null &&
              (healed > 0 ? (
                <span
                  key={healed}
                  className="font-mono text-[12px] font-bold text-[#34d399] tabular-nums"
                  style={{ animation: 'rowIn .35s ease-out both' }}
                >
                  +{healed} здоровья
                </span>
              ) : (
                <span className="font-mono text-[12px] text-[#f0a24b]">
                  разгребать нечего — заряд цел
                </span>
              ))}
          </p>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-[#6b6b77]">
            {cleanups > 0
              ? 'Закроет одну тихую мину наверняка и вернёт здоровья. Какую именно — не покажет. Упавший прод так не чинится.'
              : 'Уборки на эту смену кончились.'}
          </p>
        </div>

        <Button
          variant="secondary"
          accent={accent}
          disabled={cleanups <= 0}
          className="w-auto shrink-0 px-5 py-3"
          onClick={onCleanup}
        >
          Разгрести
        </Button>
      </div>

      <Button
        variant={urgent || checkpoint ? 'secondary' : 'primary'}
        accent={accent}
        onClick={onDone}
      >
        {marked > 0
          ? `Выкатить ${marked} ${plural(marked, 'правку', 'правки', 'правок')} · работать дальше`
          : urgent || checkpoint
            ? 'Хватит · работать дальше'
            : 'Хватит · на следующую смену'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Из «прод лежит» раньше можно было только «идти дальше»: назад
            к разбору аварии дороги не было, и выход оказывался без выхода. */}
        {onBackToIncident ? (
          <button
            onClick={onBackToIncident}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-[#6b6b77] transition-colors hover:text-[#e7e7ea]"
          >
            <Icon name="arrow-left" size={13} />
            вернуться к аварии
          </button>
        ) : (
          <span />
        )}

        {/* Смена сохраняется целиком, поэтому уйти с неё можно откуда угодно —
            в том числе отсюда, где раньше выхода не было вовсе. */}
        <Tip text="Смена сохранится: вернёшься на тот же ход" side="top">
          <button
            onClick={onExit}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-[#6b6b77] transition-colors hover:text-[#e7e7ea]"
          >
            <Icon name="log-out" size={13} />
            выйти на главную
          </button>
        </Tip>
      </div>
    </div>
  )
}
