import { parseDiff, isClickable, type DiffLine } from '../diff.ts'
import type { Task } from '../types'

export type LineState = 'idle' | 'wrong' | 'correct' | 'decoy'

interface Props {
  diff: string
  /** Подсветка из сборки пака. Нет — рисуем текстом, игра от этого не ломается. */
  tokens?: Task['tokens']
  /** Номер новой строки → состояние подсветки. */
  marks: Map<number, LineState>
  onPick?: (newNo: number) => void
  disabled?: boolean
}

const bg: Record<LineState, string> = {
  idle: '',
  wrong: 'bg-red-950/70 outline outline-red-500/60',
  correct: 'bg-emerald-950/70 outline outline-emerald-500/70',
  decoy: 'bg-amber-950/50 outline outline-amber-500/50',
}

function kindStyle(line: DiffLine): string {
  switch (line.kind) {
    case 'file':
      return 'text-zinc-500'
    case 'hunk':
      return 'text-sky-400/80 bg-sky-950/30'
    case 'add':
      return 'text-emerald-200 bg-emerald-500/5'
    case 'del':
      return 'text-red-300/70 bg-red-500/5'
    default:
      return 'text-zinc-400'
  }
}

function marker(line: DiffLine): string {
  if (line.kind === 'add') return '+'
  if (line.kind === 'del') return '−'
  return ' '
}

export function DiffView({ diff, tokens, marks, onPick, disabled }: Props) {
  const lines = parseDiff(diff)

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-zinc-800 bg-zinc-900/60">
      <table className="w-max min-w-full border-collapse font-mono text-[11px] leading-5 sm:text-[13px] sm:leading-6">
        <tbody>
          {lines.map((line) => {
            const clickable = isClickable(line) && !disabled && line.kind !== 'hunk'
            const state = line.newNo !== null ? (marks.get(line.newNo) ?? 'idle') : 'idle'

            return (
              <tr
                key={line.index}
                onClick={clickable && onPick ? () => onPick(line.newNo!) : undefined}
                className={[
                  kindStyle(line),
                  bg[state],
                  clickable ? 'cursor-pointer hover:bg-zinc-800/60 active:bg-zinc-800' : '',
                ].join(' ')}
              >
                <td className="w-7 select-none px-1 text-right text-zinc-600 tabular-nums sm:w-10 sm:px-2">
                  {line.oldNo ?? ''}
                </td>
                <td className="w-7 select-none border-r border-zinc-800 px-1 text-right text-zinc-600 tabular-nums sm:w-10 sm:px-2">
                  {line.newNo ?? ''}
                </td>
                <td className="w-4 select-none pl-1 text-zinc-600 sm:w-5 sm:pl-2">{marker(line)}</td>
                <td className="whitespace-pre pr-4">
                  {tokens?.[line.index]
                    ? tokens[line.index]!.map(([text, color], i) => (
                        <span key={i} style={color ? { color } : undefined}>
                          {text}
                        </span>
                      ))
                    : line.text || ' '}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
