/**
 * Терминал: панель рядом с дифом, а на телефоне — поверх всего экрана.
 *
 * Разбор команд живёт в `terminal.ts` — здесь только ввод, вывод и то, чтобы
 * панель не мешала смотреть диф.
 *
 * Способов ввода два, и выбирает игрок (шестерёнка → терминал). Печатать
 * `/compare-with-blueprint` большим пальцем на телефоне — наказание, а на
 * клавиатуре кнопки только отнимают место. Поэтому не «как удобнее нам»,
 * а настройка.
 */

import { useEffect, useRef, useState } from 'react'
import { beep } from '../sound.ts'
import type { TermInput } from '../storage.ts'
import { PROBES } from '../shift.ts'
import type { TerminalLine, Tone } from '../terminal.ts'
import { Icon } from '../ui/icons.tsx'
import { Tip } from '../ui/kit.tsx'

interface Props {
  /** Имя хоста в приглашении — из репозитория игрока. */
  host: string
  lines: TerminalLine[]
  accent: string
  /** Сколько платных запросов осталось на смену. */
  probes: number
  /** Как игрок вводит команды: печатает, жмёт кнопки или и то и другое. */
  input: TermInput
  /** Слежка тратит ход — во время починки её нет, и кнопки быть не должно. */
  canWatch: boolean
  /** Панель развёрнута на весь экран. */
  full: boolean
  onFull: (full: boolean) => void
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
  art: '#3f7d63',
}

/** Кнопки быстрого ввода. `arg` — команда просит номер строки. */
const COMMANDS: { label: string; command: string; hint: string; costly: boolean; arg?: boolean }[] =
  [
    { label: 'help', command: 'help', hint: 'список команд', costly: false },
    {
      label: 'git-blame',
      command: 'git-blame',
      hint: 'чем известен автор строки\nраз за ход, бесплатно',
      costly: false,
      arg: true,
    },
    {
      label: 'blueprint',
      command: 'compare-with-blueprint',
      hint: 'на что не похожа форма решения\nтратит заряд',
      costly: true,
    },
    {
      label: 'dry-run',
      command: 'deploy --dry-run',
      hint: 'прогнать удаление отмеченных строк\nтратит заряд',
      costly: true,
    },
    {
      label: 'grab-evidence',
      command: 'grab-evidence --on-line',
      hint: 'повесить лог и отпустить PR на прогон\nстоит целого хода',
      costly: false,
      arg: true,
    },
    { label: 'clear', command: 'clear', hint: 'очистить экран', costly: false },
  ]

export function Terminal({
  host,
  lines,
  accent,
  probes,
  input: mode,
  canWatch,
  full,
  onFull,
  onRun,
  onClose,
}: Props) {
  const [input, setInput] = useState('')
  /** История ввода: стрелка вверх повторяет команду, как в настоящем шелле. */
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const tail = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  function send(value = input) {
    const trimmed = value.trim()
    if (trimmed === '') return
    setHistory((h) => [trimmed, ...h])
    setCursor(-1)
    setInput('')
    onRun(trimmed)
  }

  /**
   * Кнопка команды. Тем, кому нужен номер строки, кнопка не отправляет
   * команду, а подставляет её в поле: угадывать за игрока строку нельзя.
   */
  function press(command: string, arg: boolean) {
    beep('key')
    if (!arg) {
      send(command)
      return
    }
    setInput(`${command} `)
    field.current?.focus()
  }

  const typed = mode !== 'buttons'
  const buttons = mode !== 'type'
  const available = COMMANDS.filter((c) => canWatch || !c.command.startsWith('grab-evidence'))

  return (
    <div
      className={`flex flex-col overflow-hidden border bg-[#0b0f0c] ${
        full ? 'fixed inset-0 z-70 rounded-none' : 'h-[min(62vh,460px)] w-full rounded-2xl'
      }`}
      style={{ borderColor: `${accent}3d`, boxShadow: `0 18px 40px #00000066, 0 0 0 1px #ffffff08` }}
    >
      <div className="flex items-center gap-2 border-b border-[#1b2620] bg-[#0e1512] px-3.5 py-2.5">
        <span style={{ color: accent }}>
          <Icon name="terminal" size={14} />
        </span>
        <span className="hidden font-mono text-[11px] tracking-[.16em] uppercase text-[#8b8b95] sm:inline">
          терминал
        </span>

        <span className="flex-1" />

        {/* Заряды кругом с цифрой: решение «спросить сейчас или приберечь»
            принимают глядя на счётчик, а не вспоминая, сколько потрачено. */}
        <Tip text={`Платных запросов осталось ${probes} из ${PROBES}`} side="bottom">
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full font-mono text-[10px] font-bold tabular-nums"
            style={{
              color: probes > 0 ? accent : '#7c5a5a',
              border: `2px solid ${probes > 0 ? accent : '#43303099'}`,
              background: probes > 0 ? `${accent}18` : 'transparent',
            }}
          >
            {probes}/{PROBES}
          </span>
        </Tip>

        <Tip text={full ? 'Свернуть панель' : 'Развернуть на весь экран'} side="bottom">
          <button
            onClick={() => onFull(!full)}
            aria-label={full ? 'Свернуть терминал' : 'Развернуть терминал'}
            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-[#7a7a86] hover:bg-[#18211d] hover:text-[#d8d8dd]"
          >
            <Icon name={full ? 'minimize' : 'maximize'} size={14} />
          </button>
        </Tip>

        <Tip text="Закрыть терминал" side="bottom">
          <button
            onClick={onClose}
            aria-label="Закрыть терминал"
            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-[#7a7a86] hover:bg-[#18211d] hover:text-[#d8d8dd]"
          >
            <Icon name="x" size={14} />
          </button>
        </Tip>
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
              // Заставка нарисована пробелами: перенос строк её ломает.
              whiteSpace: line.tone === 'art' ? 'pre' : 'pre-wrap',
              wordBreak: line.tone === 'art' ? 'keep-all' : 'break-word',
              fontSize: line.tone === 'art' ? 'clamp(5px,1.5vw,9px)' : undefined,
              lineHeight: line.tone === 'art' ? 1.15 : undefined,
            }}
          >
            {line.text === '' ? ' ' : line.text}
          </div>
        ))}
        <div ref={tail} />
      </div>

      {buttons && (
        <div className="flex flex-wrap gap-1.5 border-t border-[#1b2620] bg-[#0c1310] px-3 py-2.5">
          {available.map((c) => {
            const spent = c.costly && probes <= 0
            return (
              <Tip key={c.command} text={c.hint} side="top">
                <button
                  onClick={() => press(c.command, c.arg === true)}
                  disabled={spent}
                  className="cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:cursor-default disabled:opacity-40"
                  style={{
                    borderColor: c.costly ? `${accent}4d` : '#233029',
                    color: c.costly ? accent : '#9aa8a0',
                    background: c.costly ? `${accent}12` : '#111a16',
                  }}
                >
                  /{c.label}
                  {c.arg && <span className="opacity-60"> N</span>}
                </button>
              </Tip>
            )
          })}
        </div>
      )}

      {typed && (
        <div className="flex items-center gap-2 border-t border-[#1b2620] bg-[#0e1512] px-3.5 py-2.5">
          <span className="hidden font-mono text-[12px] whitespace-nowrap sm:inline" style={{ color: accent }}>
            {host}@terminal:~$
          </span>
          <span className="font-mono text-[12px] sm:hidden" style={{ color: accent }}>
            $
          </span>
          <input
            ref={field}
            value={input}
            autoFocus
            spellCheck={false}
            onChange={(e) => {
              // Стук клавиш — на изменении, а не на keydown: так молчат
              // стрелки, Ctrl и вставка из буфера одним куском.
              if (e.target.value.length > input.length) beep('key')
              setInput(e.target.value)
            }}
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
      )}
    </div>
  )
}
