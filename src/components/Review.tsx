import { MAX_ATTEMPTS } from '../round.ts'
import { ROUND_SECONDS } from '../scoring.ts'
import { plural } from '../stats.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'
import { DiffView, type LineState } from './DiffView.tsx'

interface Props {
  task: Task
  tokens: Task['tokens']
  accent: string
  left: number
  duration: number
  selected: number[]
  marks: Map<number, LineState>
  attempts: number
  shake: boolean
  onPick: (line: number) => void
  onSubmit: () => void
}

export function Review({
  task,
  tokens,
  accent,
  left,
  duration,
  selected,
  marks,
  attempts,
  shake,
  onPick,
  onSubmit,
}: Props) {
  // Починка после смены идёт без таймера: там не про скорость чтения,
  // а про то, найдёшь ли ты в собственном мёрдже то, что проглядел.
  const timed = duration > 0
  const tense = timed && left <= 20
  const tired = timed && duration < ROUND_SECONDS

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-3.5 px-[18px] pt-5">
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center justify-between gap-2.5">
          <span
            className="flex items-center gap-2 font-mono text-[11px] tracking-[.14em] uppercase"
            style={{ color: tense ? '#f87171' : '#5c5c66' }}
          >
            <span style={{ animation: tense ? 'pulseRed .8s ease-in-out infinite' : undefined }}>
              <Icon name={tense ? 'alarm-clock' : 'timer'} size={13} />
            </span>
            {!timed ? 'чиним · без таймера' : tired ? 'осталось · после инцидента' : 'осталось'}
          </span>

          <span className="flex items-center gap-3">
            {/* В починке попытка одна: показывать «две» было бы враньём. */}
            <span className="flex items-center gap-[5px]" hidden={!timed}>
              {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
                const live = i < MAX_ATTEMPTS - attempts
                return (
                  <span
                    key={i}
                    className="inline-block h-[9px] w-[9px] rounded-full transition-colors duration-250"
                    style={{
                      background: live ? accent : 'transparent',
                      boxShadow: `inset 0 0 0 1px ${live ? accent : '#3a3a44'}`,
                    }}
                  />
                )
              })}
            </span>
            <span
              className="font-mono text-[17px] font-bold whitespace-nowrap tabular-nums"
              style={{
                color: tense ? '#f87171' : '#e7e7ea',
                animation: tense ? 'pulseRed .8s ease-in-out infinite' : undefined,
              }}
            >
              {timed ? `${Math.ceil(left)} с` : '∞'}
            </span>
          </span>
        </div>

        <div className="h-[5px] overflow-hidden rounded-full bg-[#1c1c22]">
          <div
            className="h-full transition-[width,background] duration-[120ms] ease-linear"
            style={{
              width: timed ? `${(left / duration) * 100}%` : '100%',
              background: tense ? '#f87171' : accent,
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 text-sm text-[#9a9aa4]">
          Кликни строку, в которой подлянка. Можно выбрать несколько — или ↑↓ и Enter.
        </p>
        <span className="flex items-center gap-2.5">
          {selected.length > 0 && (
            <span className="font-mono text-[11px] tracking-[.1em] uppercase text-[#8b8b95]">
              выбрано {selected.length}
            </span>
          )}
          <span
            className="font-mono text-[11px] tracking-[.1em] uppercase"
            style={{ color: attempts ? '#f87171' : '#5c5c66' }}
          >
            {!timed
              ? 'одна попытка'
              : attempts
                ? `осталась ${MAX_ATTEMPTS - attempts} попытка`
                : `${MAX_ATTEMPTS} попытки`}
          </span>
        </span>
      </div>

      <DiffView
        diff={task.diff}
        tokens={tokens}
        marks={marks}
        accent={accent}
        onPick={onPick}
        shake={shake}
      />

      <Button
        accent={accent}
        variant={selected.length ? 'primary' : 'secondary'}
        icon={selected.length ? 'zap' : 'shield-check'}
        onClick={onSubmit}
      >
        {selected.length
          ? `Обвинить ${selected.length} ${plural(selected.length, 'строку', 'строки', 'строк')}`
          : 'Здесь чисто — апрув'}
      </Button>
    </div>
  )
}
