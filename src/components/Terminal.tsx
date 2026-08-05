/**
 * Терминал: панель поверх экрана ревью.
 *
 * Разбор команд живёт в `terminal.ts` — здесь только ввод, вывод и то, чтобы
 * панель не мешала смотреть диф. На узком экране она разворачивается на всю
 * ширину: набирать команды одной рукой на телефоне и так неудобно.
 */

import { useEffect, useRef, useState } from 'react'
import type { TerminalLine, Tone } from '../terminal.ts'
import { Icon } from '../ui/icons.tsx'

interface Props {
  /** Имя хоста в приглашении — из репозитория игрока. */
  host: string
  lines: TerminalLine[]
  accent: string
  onRun: (input: string) => void
  onClose: () => void
}

const COLOR: Record<Tone, string> = {
  in: '#c8b4ff',
  out: '#d8d8dd',
  muted: '#7a7a86',
  good: '#6ee7b7',
  bad: '#fca5a5',
  code: '#9ecbff',
  dossier: '#8b8b95',
}

export function Terminal({ host, lines, accent, onRun, onClose }: Props) {
  const [input, setInput] = useState('')
  /** История ввода: стрелка вверх повторяет команду, как в настоящем шелле. */
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const tail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  function send() {
    const value = input.trim()
    if (value === '') return
    setHistory((h) => [value, ...h])
    setCursor(-1)
    setInput('')
    onRun(value)
  }

  return (
    <div
      className="flex h-[min(62vh,460px)] w-full flex-col overflow-hidden rounded-2xl border bg-[#0b0f0c]"
      style={{ borderColor: `${accent}3d`, boxShadow: `0 18px 40px #00000066, 0 0 0 1px #ffffff08` }}
    >
      <div className="flex items-center gap-2 border-b border-[#1b2620] bg-[#0e1512] px-3.5 py-2.5">
        <span style={{ color: accent }}>
          <Icon name="terminal" size={14} />
        </span>
        <span className="font-mono text-[11px] tracking-[.16em] uppercase text-[#8b8b95]">
          терминал
        </span>
        <span className="flex-1" />
        <button
          onClick={onClose}
          title="Закрыть терминал"
          className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-[#7a7a86] hover:bg-[#18211d] hover:text-[#d8d8dd]"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3 font-mono text-[12px] leading-[1.75]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={line.tone === 'dossier' ? 'pl-3' : ''}
            style={{
              color: COLOR[line.tone],
              // Досье — вставка «карточкой», как в макете: слева тонкая линия.
              borderLeft: line.tone === 'dossier' ? `2px solid ${accent}55` : undefined,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {line.text === '' ? ' ' : line.text}
          </div>
        ))}
        <div ref={tail} />
      </div>

      <div className="flex items-center gap-2 border-t border-[#1b2620] bg-[#0e1512] px-3.5 py-2.5">
        <span className="font-mono text-[12px] whitespace-nowrap" style={{ color: accent }}>
          {host}@terminal:~$
        </span>
        <input
          value={input}
          autoFocus
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Клавиши дифа (↑↓ и Enter) слушает экран ревью — из терминала
            // они не должны двигать выделение строк.
            e.stopPropagation()
            if (e.key === 'Enter') {
              send()
              return
            }
            if (e.key === 'ArrowUp' && history.length > 0) {
              e.preventDefault()
              const next = Math.min(cursor + 1, history.length - 1)
              setCursor(next)
              setInput(history[next])
              return
            }
            if (e.key === 'ArrowDown' && cursor >= 0) {
              e.preventDefault()
              const next = cursor - 1
              setCursor(next)
              setInput(next < 0 ? '' : history[next])
            }
          }}
          placeholder="help"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[#e7e7ea] outline-none placeholder:text-[#3f4a44]"
        />
      </div>
    </div>
  )
}
