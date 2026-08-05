import { useState, type ReactNode } from 'react'
import { MAX_ATTEMPTS } from '../round.ts'
import { ROUND_SECONDS } from '../scoring.ts'
import { plural } from '../stats.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Button, Tip } from '../ui/kit.tsx'
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
  /**
   * Секундомер смены. Там таймера нет: важнее качество, чем скорость, —
   * но время идёт и попадает в отчёт. null — режим с обратным отсчётом.
   */
  stopwatch?: number | null
  /** Панель терминала. Есть только в смене — в остальных режимах её нет. */
  terminal?: ReactNode
  /** Сколько запросов к терминалу осталось на смену. */
  probes?: number | null
  /** Открыть терминал. null — режим без терминала, кнопки не будет. */
  onTerminal?: (() => void) | null
  /** Терминал развёрнут на весь экран — тогда диф прятать незачем и нечем. */
  terminalFull?: boolean
  /** Комментарий автора в коде: зацепка про характер, а не про подлянку. */
  note?: { index: number; text: string } | null
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
  stopwatch = null,
  terminal,
  probes = null,
  onTerminal,
  terminalFull = false,
  note = null,
  onPick,
  onSubmit,
}: Props) {
  /** Код во весь экран — на телефоне единственный способ его прочитать. */
  const [full, setFull] = useState(false)
  // Починка после смены идёт без таймера: там не про скорость чтения,
  // а про то, найдёшь ли ты в собственном мёрдже то, что проглядел.
  const timed = duration > 0
  // Смена тоже без таймера, но это не починка: попытки там обычные,
  // и отличает её как раз секундомер.
  const fixing = !timed && stopwatch === null
  const tense = timed && left <= 20
  const tired = timed && duration < ROUND_SECONDS

  return (
    <div
      className={`screen-in mx-auto flex flex-col gap-3.5 px-[18px] pt-5 ${
        terminal ? 'max-w-[1340px]' : 'max-w-[900px]'
      }`}
    >
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center justify-between gap-2.5">
          <span
            className="flex items-center gap-2 font-mono text-[11px] tracking-[.14em] uppercase"
            style={{ color: tense ? '#f87171' : '#5c5c66' }}
          >
            <span style={{ animation: tense ? 'pulseRed .8s ease-in-out infinite' : undefined }}>
              <Icon name={tense ? 'alarm-clock' : 'timer'} size={13} />
            </span>
            {timed
              ? tired
                ? 'осталось · после инцидента'
                : 'осталось'
              : stopwatch !== null
                ? 'смена · время не поджимает'
                : 'чиним · без таймера'}
          </span>

          <span className="flex items-center gap-3">
            {/* В починке попытка одна: показывать «две» было бы враньём. */}
            <span className="flex items-center gap-[5px]" hidden={fixing}>
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
              {timed
                ? `${Math.ceil(left)} с`
                : stopwatch !== null
                  ? `${Math.floor(stopwatch)} с`
                  : '∞'}
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
            {fixing
              ? 'одна попытка'
              : attempts
                ? `осталась ${MAX_ATTEMPTS - attempts} попытка`
                : `${MAX_ATTEMPTS} попытки`}
          </span>
        </span>
      </div>

      <div className="flex flex-col items-start gap-3.5 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          <DiffView
            diff={task.diff}
            tokens={tokens}
            marks={marks}
            accent={accent}
            onPick={onPick}
            shake={shake}
            note={note}
            full={full}
            onFull={setFull}
            corner={
              // Вызов терминала — иконкой в углу самого блока кода. Отдельной
              // строкой под дифом кнопка уезжала за нижний край экрана,
              // и на телефоне терминала будто не было вовсе.
              onTerminal && !terminal && !terminalFull ? (
                <Tip
                  text={probes !== null ? `Терминал · ${probes} платных запросов` : 'Терминал'}
                  side="top"
                  className="pointer-events-auto"
                >
                  <button
                    onClick={onTerminal}
                    aria-label="Открыть терминал"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-transform hover:scale-105 active:scale-95"
                    style={{
                      borderColor: `${accent}88`,
                      color: accent,
                      background: '#0b0f0ce8',
                      boxShadow: `0 6px 18px #00000088, 0 0 16px ${accent}33`,
                    }}
                  >
                    <Icon name="terminal" size={18} />
                  </button>
                </Tip>
              ) : null
            }
          />
        </div>

        {terminal && <div className="w-full shrink-0 lg:w-[440px]">{terminal}</div>}
      </div>

      <Button
        accent={accent}
        variant={selected.length ? 'primary' : 'secondary'}
        icon={selected.length ? (fixing ? 'hammer' : 'zap') : 'shield-check'}
        onClick={onSubmit}
      >
        {/* Смена — это ревью, а не починка: там обвиняют и апрувят,
            даже если таймера нет. */}
        {selected.length
          ? fixing
            ? `Править ${selected.length} ${plural(selected.length, 'строку', 'строки', 'строк')}`
            : `Обвинить ${selected.length} ${plural(selected.length, 'строку', 'строки', 'строк')}`
          : fixing
            ? 'Закрыть, не трогая'
            : 'Здесь чисто — апрув'}
      </Button>
    </div>
  )
}
