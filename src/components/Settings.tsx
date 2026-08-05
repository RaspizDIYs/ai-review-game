/**
 * Настройки — модалка под шестерёнкой в шапке.
 *
 * Раньше звук жил в кнопке-переключателе, которая ходила по кругу из трёх
 * ступеней: включено → открыта настройка → выключено всё. Из-за круга
 * отдельные тумблеры теряли своё состояние — выключенные щелчки возвращались
 * сами собой, стоило разок заглушить и вернуть звук. Здесь каждый тумблер
 * сам по себе и переключает ровно то, что написано.
 *
 * Модалка, а не экран: настройки открывают посреди хода, и терять из-под ног
 * диф ради громкости незачем.
 */

import { useEffect, type ReactNode } from 'react'
import type { Track } from '../music.ts'
import type { TermInput } from '../storage.ts'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Kicker, Tip } from '../ui/kit.tsx'

interface Props {
  accent: string
  sound: boolean
  typing: boolean
  music: number
  musicOn: boolean
  track: Track | null
  termInput: TermInput
  onSound: (on: boolean) => void
  onTyping: (on: boolean) => void
  onMusic: (volume: number) => void
  onMusicToggle: (on: boolean) => void
  onNextTrack: () => void
  onTermInput: (mode: TermInput) => void
  onClose: () => void
}

/** Тумблер: подпись слева, переключатель справа. */
function Toggle({
  label,
  hint,
  icon,
  on,
  accent,
  onChange,
}: {
  label: string
  hint: string
  icon: IconName
  on: boolean
  accent: string
  onChange: (on: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[#26262c] bg-[#101014] px-3.5 py-3 text-left transition-colors hover:border-[#3a3a44]"
    >
      <span style={{ color: on ? accent : '#4a4a54' }}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-[#e7e7ea]">{label}</span>
        <span className="block text-[12px] leading-[1.4] text-[#6b6b77]">{hint}</span>
      </span>
      <span
        className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? accent : '#2a2a32' }}
      >
        <span
          className="absolute top-[3px] h-4 w-4 rounded-full bg-[#0b0b0f] transition-[left] duration-200"
          style={{ left: on ? 19 : 3 }}
        />
      </span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Kicker>{title}</Kicker>
      {children}
    </div>
  )
}

const INPUT_MODES: { id: TermInput; label: string; hint: string }[] = [
  { id: 'type', label: 'Печатать', hint: 'только поле ввода' },
  { id: 'buttons', label: 'Кнопки', hint: 'команды одним нажатием' },
  { id: 'both', label: 'И то и другое', hint: 'кнопки над полем' },
]

export function Settings({
  accent,
  sound,
  typing,
  music,
  musicOn,
  track,
  termInput,
  onSound,
  onTyping,
  onMusic,
  onMusicToggle,
  onNextTrack,
  onTermInput,
  onClose,
}: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const percent = Math.round(music * 100)

  return (
    <div
      className="fixed inset-0 z-70 flex items-start justify-center overflow-y-auto bg-[#06060899] px-4 py-[max(16px,6vh)] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Настройки"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[440px] flex-col gap-5 rounded-2xl border border-[#26262c] bg-[#111116] p-5"
        style={{ animation: 'toastIn .3s cubic-bezier(.2,1.2,.4,1) both', boxShadow: '0 30px 70px rgba(0,0,0,.6)' }}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: accent }}>
            <Icon name="settings" size={17} />
          </span>
          <h2 className="font-display m-0 flex-1 text-[19px] font-bold tracking-[-.02em] text-[#f4f4f6]">
            Настройки
          </h2>
          <Tip text="Закрыть · Esc" side="bottom">
            <button
              onClick={onClose}
              aria-label="Закрыть настройки"
              className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-lg text-[#7a7a86] transition-colors hover:bg-white/6 hover:text-[#e7e7ea]"
            >
              <Icon name="x" size={15} />
            </button>
          </Tip>
        </div>

        <Section title="звук">
          <Toggle
            label="Музыка"
            hint={track ? `играет: ${track.title}` : 'фоновая тема'}
            icon="music"
            on={musicOn}
            accent={accent}
            onChange={onMusicToggle}
          />

          <div className="flex items-center gap-3 rounded-xl border border-[#26262c] bg-[#101014] px-3.5 py-3">
            <span className="text-[#6b6b77]">
              <Icon name="volume-2" size={15} />
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={(e) => onMusic(Number(e.target.value) / 100)}
              aria-label="Громкость музыки"
              className="vol-range min-w-0 flex-1 cursor-pointer"
              style={
                {
                  '--vol-accent': musicOn ? accent : '#4a4a54',
                  '--vol-pos': `${percent}%`,
                } as React.CSSProperties
              }
            />
            <span className="w-[28px] shrink-0 text-right font-mono text-[11px] text-[#6b6b77] tabular-nums">
              {percent}
            </span>
            <Tip text="Следующий трек" side="top">
              <button
                onClick={onNextTrack}
                aria-label="Следующий трек"
                className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-[#6b6b77] transition-colors hover:bg-white/6 hover:text-[#e7e7ea]"
              >
                <Icon name="skip-forward" size={13} />
              </button>
            </Tip>
          </div>

          <Toggle
            label="Щелчки интерфейса"
            hint="клики, отправка, вердикт"
            icon="volume-2"
            on={sound}
            accent={accent}
            onChange={onSound}
          />

          <Toggle
            label="Стук клавиш в терминале"
            hint="печать команд звучит как печать"
            icon="terminal"
            on={typing}
            accent={accent}
            onChange={onTyping}
          />
        </Section>

        <Section title="терминал">
          <div className="grid grid-cols-3 gap-2">
            {INPUT_MODES.map((mode) => {
              const on = termInput === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => onTermInput(mode.id)}
                  aria-pressed={on}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-xl border-[1.5px] px-2.5 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: on ? accent : '#26262c',
                    background: on ? `${accent}14` : '#101014',
                    color: on ? accent : '#8b8b95',
                  }}
                >
                  <span className="font-mono text-[11px] tracking-[.06em] uppercase">
                    {mode.label}
                  </span>
                  <span className="text-[11px] leading-[1.35] text-[#6b6b77]">{mode.hint}</span>
                </button>
              )
            })}
          </div>
        </Section>
      </div>
    </div>
  )
}
