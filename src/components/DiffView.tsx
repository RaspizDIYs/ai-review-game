import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { diffStat, parseDiff, isClickable, type DiffLine } from '../diff.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Tip } from '../ui/kit.tsx'

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
  /**
   * Диф развёрнут на весь экран. На телефоне читать код в окошке в треть
   * экрана невозможно: строки длинные, а вокруг ещё шапка и кнопка отправки.
   */
  full?: boolean
  onFull?: (full: boolean) => void
  /**
   * Кнопка в правом нижнем углу панели — там живёт вызов терминала.
   * Отдельной строкой под дифом она уезжала за нижний край экрана.
   */
  corner?: ReactNode
  /**
   * Комментарий автора в коде: индекс строки дифа и текст.
   *
   * Дописывается в хвост строки, а не отдельной строкой, — иначе поехали бы
   * номера, а по ним считается всё: попадания, обманки, слежка.
   */
  note?: { index: number; text: string } | null
  /**
   * Панель обязана занять всю высоту родителя и прокручиваться внутри себя.
   * Так диф и терминал на широком экране стоят рядом одинаковой высоты,
   * а не разъезжаются на два экрана прокрутки.
   */
  fill?: boolean
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
  const { adds, dels } = diffStat(diff)
  return `+${adds} −${dels}`
}

export function DiffView({
  diff,
  tokens,
  marks,
  accent,
  onPick,
  disabled,
  shake,
  full = false,
  onFull,
  corner,
  note = null,
  fill = false,
}: Props) {
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

  const panel = (
    <div
      // `relative` и `fixed` вместе не пишем: Tailwind раскладывает утилиты
      // позиционирования в своём порядке, и `.relative` оказывается ниже
      // `.fixed` в стилях — то есть выигрывает всегда. Из-за этого кнопка
      // «развернуть» честно переключала класс и ровно ничего не делала.
      className={`flex flex-col overflow-hidden border border-[#26262c] bg-[#111116] ${
        shake ? 'shake' : ''
      } ${full ? 'fixed inset-0 z-60' : `relative rounded-[14px] ${fill ? 'lg:h-full' : ''}`}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#1f1f26] bg-[#0e0e12] px-[13px] py-[9px]">
        <span className="text-[#6b6b77]">
          <Icon name="file-code" size={14} />
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-[#8b8b95]">
          {fileName(diff)}
        </span>
        <span className="flex-1" />
        <span className="rounded-full border border-[#26262c] px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-[#4ade80]">
          {stat(diff)}
        </span>
        {onFull && (
          <Tip text={full ? 'Свернуть код' : 'Развернуть код на весь экран'} side="bottom">
            <button
              onClick={() => onFull(!full)}
              aria-label={full ? 'Свернуть код' : 'Развернуть код'}
              className="flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-md text-[#6b6b77] transition-colors hover:bg-white/6 hover:text-[#e7e7ea]"
            >
              <Icon name={full ? 'minimize' : 'maximize'} size={13} />
            </button>
          </Tip>
        )}
      </div>

      <div
        ref={box}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        role={disabled ? undefined : 'listbox'}
        aria-multiselectable={disabled ? undefined : true}
        aria-label="Диф. Стрелки — по строкам, Enter — отметить"
        className={`max-w-full overscroll-contain focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-500 ${
          // На телефоне длинные строки переносятся, а не уезжают вбок:
          // горизонтальная прокрутка в дифе — это чтение кода в щёлочку,
          // и половина строки просто не существует для игрока. На широком
          // экране перенос не нужен, там честнее прокрутка.
          'max-sm:overflow-x-hidden sm:overflow-x-auto'
        } ${
          full || fill
            ? 'min-h-0 flex-1 overflow-y-auto'
            : // Иначе панель растёт по коду, страница уезжает на три экрана,
              // и кнопка отправки вместе с таймером живут где-то внизу.
              // Прокрутка внутри блока держит их на месте.
              'max-h-[56vh] overflow-y-auto lg:max-h-[64vh]'
        }`}
      >
        {/* Кегль пляшет по ширине экрана: на телефоне 10.5px — это ещё
            читаемо, но в строку влезает вдвое больше, чем на 12.5px. */}
        <table className="w-full border-collapse font-mono text-[10.5px] leading-[1.75] sm:text-[11.5px] sm:leading-[1.85] lg:text-[12.5px]">
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
                  {/* Старая нумерация на телефоне съедает пятую часть ширины
                      ради колонки, по которой не кликают. */}
                  <td className="hidden w-[34px] px-[7px] text-right text-[#454550] tabular-nums select-none sm:table-cell">
                    {line.oldNo ?? ''}
                  </td>
                  <td className="w-[26px] border-r border-[#1f1f26] px-1 text-right text-[#565662] tabular-nums select-none sm:w-[34px] sm:px-[7px]">
                    {line.newNo ?? ''}
                  </td>
                  <td className="w-[14px] pl-1 text-[#565662] select-none sm:w-[18px] sm:pl-[7px]">
                    {marker(line)}
                  </td>
                  <td className="pr-2 pl-1 whitespace-pre-wrap [overflow-wrap:anywhere] sm:pr-3.5 sm:whitespace-pre sm:[overflow-wrap:normal]">
                    {tokens?.[line.index]
                      ? tokens[line.index]!.map(([text, color], i) => (
                          <span key={i} style={color ? { color } : undefined}>
                            {text}
                          </span>
                        ))
                      : line.text || ' '}
                    {note?.index === line.index && (
                      <span className="text-[#6b7280] italic">  {note.text}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {corner && <div className="pointer-events-none absolute right-3 bottom-3 z-10">{corner}</div>}
    </div>
  )

  // Во весь экран — через портал в body. `position: fixed` считается не от
  // окна, а от ближайшего предка с трансформацией, а на экране ревью такой
  // есть: анимация появления `screen-in`. Из-за неё развёрнутый диф вставал
  // под шапку и занимал четверть экрана вместо всего.
  return full ? createPortal(panel, document.body) : panel
}

