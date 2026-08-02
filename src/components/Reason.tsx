import { useEffect, useRef } from 'react'
import type { ReasonOption } from '../reason.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Kicker } from '../ui/kit.tsx'
import { DiffView, type LineState } from './DiffView.tsx'

interface Props {
  task: Task
  tokens: Task['tokens']
  accent: string
  /** Строки, которые игрок отметил, — подсвечены, чтобы не листать обратно. */
  picks: number[]
  options: ReasonOption[]
  onAnswer: (option: ReasonOption) => void
}

/**
 * Шаг «почему»: строку нашли, теперь надо назвать, что с ней не так.
 *
 * Таймер здесь уже остановлен и очки за время посчитаны: этот шаг проверяет
 * понимание, а не скорость. Цена ошибки — половина очков раунда, но раунд
 * остаётся выигранным: строку-то нашёл.
 */
export function Reason({ task, tokens, accent, picks, options, onAnswer }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus({ preventScroll: true })
  }, [task.id])

  const marks = new Map<number, LineState>(picks.map((line) => [line, 'correct' as const]))

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="flex items-center gap-2.5">
        <span className="text-[#34d399]">
          <Icon name="target" size={22} />
        </span>
        <div>
          <h2 className="font-display m-0 text-[clamp(20px,3.6vw,26px)] font-bold tracking-[-.02em] text-[#34d399]">
            Строка та
          </h2>
          <p className="mt-1 text-sm leading-[1.5] text-[#9a9aa4]">
            Теперь скажи, что с ней не так. Ошибёшься — раунд засчитан, но вполовину.
          </p>
        </div>
      </div>

      <DiffView diff={task.diff} tokens={tokens} marks={marks} accent={accent} disabled />

      <Kicker>что здесь не так</Kicker>

      <ul className="flex flex-col gap-2.5">
        {options.map((option, i) => (
          <li key={option.tag}>
            <button
              ref={i === 0 ? first : undefined}
              onClick={() => onAnswer(option)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[#26262c] bg-[#111116] px-4 py-3.5 text-left text-[15px] leading-[1.4] text-[#d8d8dd] transition-[border-color,background,color] hover:border-[#3a3a44] hover:bg-[#15151b] hover:text-[#f2f2f5] focus-visible:outline-none focus-visible:ring-2"
              style={{ ['--tw-ring-color' as string]: `${accent}88` }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold"
                style={{ border: `1.5px solid ${accent}55`, color: accent }}
              >
                {i + 1}
              </span>
              {option.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
