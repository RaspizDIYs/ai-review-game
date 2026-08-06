/**
 * Терминал: панель рядом с дифом, а на телефоне — поверх всего экрана.
 *
 * Разбор команд живёт в `terminal.ts` — здесь только ввод, вывод и то, чтобы
 * панель не мешала смотреть диф.
 *
 * Способов ввода два, и выбирает игрок (шестерёнка → терминал): на телефоне
 * удобнее кнопки, на клавиатуре они только отнимают место. Поэтому не «как
 * удобнее нам», а настройка.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Чем команда платит. Три валюты, и различать их важнее, чем экономить место:
 * заряд кончится к середине смены, а ход не вернуть вовсе.
 */
type Cost = 'free' | 'probe' | 'turn'

const COST: Record<Cost, { mark: string; color: string; label: string }> = {
  free: { mark: '·', color: '#6b7d73', label: 'бесплатно' },
  probe: { mark: '◆', color: '#c9a227', label: 'тратит заряд' },
  turn: { mark: '■', color: '#f87171', label: 'тратит ход' },
}

/**
 * Кнопки быстрого ввода.
 *
 * Подпись кнопки — ровно то, что ушло бы в поле ввода: нажал `/check` —
 * в истории команд появится `/check`. Имена короткие и все одной длины,
 * чтобы их можно было набрать одним пальцем и запомнить с первого раза;
 * прежние `compare-with-blueprint` и `grab-evidence --on-line` терминал
 * по-прежнему понимает, но нигде не показывает.
 *
 * `arg` — команда просит номер строки: такая кнопка не отправляет, а
 * подставляет команду в поле. Номер за игрока не угадывают.
 */
const COMMANDS: { command: string; hint: string; cost: Cost; arg?: boolean }[] = [
  { command: 'help', hint: 'список команд', cost: 'free' },
  {
    command: 'blame',
    hint: 'кто написал этот PR и чем известен\nодин раз за ход',
    cost: 'free',
  },
  {
    command: 'check',
    hint: 'сверить с эталоном из базы\nна что не похожа форма решения',
    cost: 'probe',
  },
  {
    command: 'deploy',
    hint: 'пробная выкладка отмеченных строк\nпокажет, каким станет прод',
    cost: 'probe',
  },
  {
    command: 'log',
    hint: 'повесить лог на строки и отпустить PR на прогон\nрешение по нему всё равно за тобой',
    cost: 'turn',
    arg: true,
  },
  { command: 'clear', hint: 'очистить экран', cost: 'free' },
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

  /**
   * Узкий экран. Считаем в JS, а не классами: от того, во весь экран панель
   * или нет, зависит не только вёрстка, но и портал — а медиазапрос из CSS
   * реакту не виден.
   */
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const sync = () => setNarrow(mq.matches)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // На телефоне терминал всегда во весь экран: панель в треть экрана,
  // из которой видно четыре строки лога, — это не инструмент.
  const fullscreen = full || narrow

  const typed = mode !== 'buttons'
  const buttons = mode !== 'type'
  const available = COMMANDS.filter((c) => canWatch || c.command !== 'log')

  const panel = (
    <div
      className={`flex flex-col overflow-hidden border bg-[#0b0f0c] ${
        fullscreen ? 'fixed inset-0 z-70' : 'h-full w-full rounded-2xl'
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
          {/* Не круг, а капсула: «4/4» в кружке 26px упиралось в обводку
              с обеих сторон и читалось как клякса. */}
          <span
            className="flex h-[24px] items-center gap-px rounded-full px-2.5 font-mono text-[11px] font-bold tabular-nums"
            style={{
              color: probes > 0 ? accent : '#7c5a5a',
              border: `1.5px solid ${probes > 0 ? `${accent}88` : '#43303099'}`,
              background: probes > 0 ? `${accent}18` : 'transparent',
            }}
          >
            {probes}
            <span className="opacity-45">/{PROBES}</span>
          </span>
        </Tip>

        {/* На узком экране терминал и так во весь экран — разворачивать
            нечего, и кнопка, которая ничего не меняет, только сбивает с толку. */}
        {!narrow && (
          <Tip text={full ? 'Свернуть панель' : 'Развернуть на весь экран'} side="bottom">
            <button
              onClick={() => onFull(!full)}
              aria-label={full ? 'Свернуть терминал' : 'Развернуть терминал'}
              className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-[#7a7a86] hover:bg-[#18211d] hover:text-[#d8d8dd]"
            >
              <Icon name={full ? 'minimize' : 'maximize'} size={14} />
            </button>
          </Tip>
        )}

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
              // 33 знака в строке — влезают целиком даже на узкой панели,
              // и ужимать до нечитаемого больше не приходится.
              fontSize: line.tone === 'art' ? 'clamp(9px,2.6vw,13px)' : undefined,
              lineHeight: line.tone === 'art' ? 1.05 : undefined,
            }}
          >
            {line.text === '' ? ' ' : line.text}
          </div>
        ))}
        <div ref={tail} />
      </div>

      {buttons && (
        <div className="shrink-0 border-t border-[#1b2620] bg-[#0c1310] px-3 py-2.5">
          {/* Кнопки одного роста и одного цвета: команды различаются не
              оформлением, а ценой — её и показывает значок слева. */}
          <div className="flex flex-wrap gap-1.5">
            {available.map((c) => {
              const cost = COST[c.cost]
              const spent = c.cost === 'probe' && probes <= 0

              return (
                <Tip key={c.command} text={`${c.hint}\n${cost.label}`} side="top">
                  <button
                    onClick={() => press(c.command, c.arg === true)}
                    disabled={spent}
                    className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#233029] bg-[#111a16] px-2.5 font-mono text-[11px] text-[#9aa8a0] transition-colors hover:border-[#33463c] hover:text-[#d8d8dd] disabled:cursor-default disabled:opacity-35 disabled:hover:border-[#233029] disabled:hover:text-[#9aa8a0]"
                  >
                    <span aria-hidden style={{ color: cost.color }}>
                      {cost.mark}
                    </span>
                    <span className="whitespace-nowrap">
                      /{c.command}
                      {c.arg && <span className="opacity-50"> N</span>}
                    </span>
                  </button>
                </Tip>
              )
            })}
          </div>

          <p className="m-0 mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[#5d6b63]">
            {(['free', 'probe', 'turn'] as const).map((kind) => (
              <span key={kind} className="whitespace-nowrap">
                <span style={{ color: COST[kind].color }}>{COST[kind].mark}</span>{' '}
                {COST[kind].label}
              </span>
            ))}
          </p>
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

  // Во весь экран — порталом в body: иначе панель остаётся внутри стека
  // экрана и уезжает под липкую шапку, какой бы z-index ей ни поставить.
  return fullscreen ? createPortal(panel, document.body) : panel
}
