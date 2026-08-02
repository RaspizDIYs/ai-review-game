import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { parseDiff, isClickable, type DiffLine } from '../diff.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'

export type LineState = 'idle' | 'picked' | 'wrong' | 'correct' | 'decoy' | 'missed-bug'

interface Props {
  diff: string
  /** Подсветка из сборки пака. Нет — рисуем текстом, игра от этого не ломается. */
  tokens?: Task['tokens']
  /** Номер новой строки → состояние подсветки. */
  marks: Map<number, LineState>
  accent: string
  onPick?: (newNo: number) => void
  disabled?: boolean
  /** Промах трясёт панель — это единственная анимация, которая что-то говорит. */
  shake?: boolean
}

const KIND: Record<DiffLine['kind'], CSSProperties> = {
  file: { color: '#4a4a54' },
  hunk: { color: 'rgba(125,211,252,.75)', background: 'rgba(8,47,73,.35)' },
  add: { color: '#b6f0d4', background: 'rgba(16,185,129,.055)' },
  del: { color: 'rgba(252,165,165,.62)', background: 'rgba(239,68,68,.05)' },
  context: { color: '#9a9aa4' },
}

const MARK: Record<Exclude<LineState, 'idle' | 'picked'>, CSSProperties> = {
  wrong: {
    background: 'rgba(127,29,29,.55)',
    boxShadow: 'inset 0 0 0 1px rgba(248,113,113,.55)',
  },
  correct: {
    background: 'rgba(6,78,59,.6)',
    boxShadow: 'inset 0 0 0 1px rgba(52,211,153,.65)',
  },
  decoy: {
    background: 'rgba(120,53,15,.4)',
    boxShadow: 'inset 0 0 0 1px rgba(251,191,36,.45)',
  },
  'missed-bug': {
    background: 'rgba(6,78,59,.25)',
    outline: '1px dashed rgba(52,211,153,.55)',
    outlineOffset: '-1px',
  },
}

function marker(line: DiffLine): string {
  if (line.kind === 'add') return '+'
  if (line.kind === 'del') return '−'
  return ' '
}

/** Имя файла берём из заголовка дифа: отдельного поля в паке нет и не нужно. */
function fileName(diff: string): string {
  const header = diff.split('\n').find((l) => l.startsWith('+++ '))
  return header ? header.replace(/^\+\+\+ b\//, '').trim() : 'diff'
}

function stat(diff: string): string {
  const lines = diff.split('\n')
  const adds = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const dels = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
  return `+${adds} −${dels}`
}

export function DiffView({ diff, tokens, marks, accent, onPick, disabled, shake }: Props) {
  const lines = useMemo(() => parseDiff(diff), [diff])

  // Аудитория игры мышь не любит: ↑/↓ ведут по строкам, Enter отмечает.
  // Это же делает диф доступным с клавиатуры вообще.
  const pickable = useMemo(
    () => lines.filter((l) => isClickable(l) && l.kind !== 'hunk'),
    [lines],
  )
  const [cursor, setCursor] = useState(0)
  const rows = useRef(new Map<number, HTMLTableRowElement>())
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => setCursor(0), [diff])

  // Фокус сразу на дифе: иначе первая стрелка уходит в прокрутку страницы,
  // а таймер уже идёт.
  useEffect(() => {
    if (!disabled) box.current?.focus({ preventScroll: true })
  }, [disabled, diff])

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled || pickable.length === 0) return

    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      const next = Math.min(pickable.length - 1, Math.max(0, cursor + step))
      setCursor(next)
      rows.current.get(pickable[next].index)?.scrollIntoView({ block: 'nearest' })
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPick?.(pickable[cursor].newNo!)
    }
  }

  const focused = pickable[cursor]?.index
  const picked: CSSProperties = {
    background: `${accent}22`,
    boxShadow: `inset 3px 0 0 ${accent}, inset 0 0 0 1px ${accent}66`,
  }

  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-[#26262c] bg-[#111116] ${shake ? 'shake' : ''}`}
    >
      <div className="flex items-center gap-2 border-b border-[#1f1f26] bg-[#0e0e12] px-[13px] py-[9px]">
        <span className="text-[#6b6b77]">
          <Icon name="file-code" size={14} />
        </span>
        <span className="font-mono text-[11px] text-[#8b8b95]">{fileName(diff)}</span>
        <span className="flex-1" />
        <span className="rounded-full border border-[#26262c] px-2.5 py-0.5 font-mono text-[11px] text-[#4ade80]">
          {stat(diff)}
        </span>
      </div>

      <div
        ref={box}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        role={disabled ? undefined : 'listbox'}
        aria-multiselectable={disabled ? undefined : true}
        aria-label="Диф. Стрелки — по строкам, Enter — отметить"
        className="max-w-full overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-500"
      >
        <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.85]">
          <tbody>
            {lines.map((line) => {
              const clickable = isClickable(line) && !disabled && line.kind !== 'hunk'
              const state = line.newNo !== null ? (marks.get(line.newNo) ?? 'idle') : 'idle'
              const mark =
                state === 'picked' ? picked : state === 'idle' ? undefined : MARK[state]

              return (
                <tr
                  key={line.index}
                  ref={(el) => {
                    if (el) rows.current.set(line.index, el)
                    else rows.current.delete(line.index)
                  }}
                  onClick={clickable && onPick ? () => onPick(line.newNo!) : undefined}
                  role={clickable ? 'option' : undefined}
                  aria-selected={clickable ? state === 'picked' : undefined}
                  className={clickable ? 'cursor-pointer hover:brightness-135' : ''}
                  style={{
                    ...KIND[line.kind],
                    ...mark,
                    ...(clickable && line.index === focused && state === 'idle'
                      ? { boxShadow: 'inset 0 0 0 1px #3a3a44' }
                      : null),
                    transition: 'background .15s, box-shadow .15s',
                  }}
                >
                  <td className="w-[34px] px-[7px] text-right text-[#454550] tabular-nums select-none">
                    {line.oldNo ?? ''}
                  </td>
                  <td className="w-[34px] border-r border-[#1f1f26] px-[7px] text-right text-[#565662] tabular-nums select-none">
                    {line.newNo ?? ''}
                  </td>
                  <td className="w-[18px] pl-[7px] text-[#565662] select-none">{marker(line)}</td>
                  <td className="px-3.5 pl-1 whitespace-pre">
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
    </div>
  )
}
