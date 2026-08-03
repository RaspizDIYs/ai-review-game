/**
 * Фаза починки — между сменами.
 *
 * Смена пережита, и теперь можно разобрать завалы. Кнопок «откатить» и
 * «отправить на доработку» здесь нет и не будет: игрок открывает свой же
 * мёрдж заново, ищет в нём то, что проглядел, и размечает строки руками.
 * Починка и ревью — одно и то же действие, отличается только смысл.
 *
 * Чинить можно сколько угодно раз, и это не щедрость. Каждая попытка — время
 * в проде: фитили тикают. А если полезть в PR, где всё было чисто, — сломаешь
 * его сам и получишь мину, которой не было. Ограничение здесь не в счётчике,
 * а в том, что лишние попытки дороже, чем кажется.
 */

import type { ShiftEvent } from '../shift.ts'
import { plural } from '../stats.ts'
import { Icon } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'

interface Props {
  /** Все мёрджи, которые игрок пустил в прод. Какие из них с подлянкой — неизвестно. */
  merged: ShiftEvent[]
  titles: Map<string, string>
  /** Сколько раз уже лазили в каждый PR — единственное, что игра тут помнит. */
  tried: Map<number, number>
  health: number
  accent: string
  onPick: (pr: number, task: string) => void
  onDone: () => void
}

export function RepairPick({ merged, titles, tried, health, accent, onPick, onDone }: Props) {
  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display m-0 text-[clamp(20px,3.6vw,27px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
          Разбор завалов
        </h1>
        <span className="font-mono text-[11px] text-[#6b6b77]">
          здоровье прода {Math.round(health)}
        </span>
      </div>

      <p className="m-0 max-w-[640px] text-sm leading-[1.55] text-[#9a9aa4]">
        Вот всё, что ты пустил в прод за смену. Где-то здесь сидит то, что его
        ломает — а может, и нет. Открывай и смотри заново: найдёшь подлянку и
        разметишь её точно — починено. Промахнёшься — станет только хуже.
      </p>

      <div className="flex flex-col gap-1.5">
        {merged.map((event) => {
          if (event.kind !== 'merged') return null
          const times = tried.get(event.pr) ?? 0

          return (
            <button
              key={event.pr}
              onClick={() => onPick(event.pr, event.task)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-[#202027] bg-[#101014] px-3.5 py-3 text-left transition-colors hover:border-[#3a3a44]"
            >
              <span className="text-[#4a4a54]">
                <Icon name="git-pull-request" size={14} />
              </span>
              <span className="font-mono text-[11px] text-[#6b6b77]">#{event.pr}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#d8d8dd]">
                {titles.get(event.task) ?? event.task}
              </span>
              {times > 0 && (
                <span className="font-mono text-[10px] whitespace-nowrap text-[#5c5c66]">
                  лазил {times} {plural(times, 'раз', 'раза', 'раз')}
                </span>
              )}
              <span className="font-mono text-[10px] whitespace-nowrap text-[#4a4a54]">
                ход {event.turn + 1}
              </span>
            </button>
          )
        })}
      </div>

      <Button accent={accent} onClick={onDone}>
        Хватит · на следующую смену
      </Button>
    </div>
  )
}
