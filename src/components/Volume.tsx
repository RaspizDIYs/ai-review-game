/**
 * Регулятор звука в шапке.
 *
 * Кнопка громкости раскрывает ползунок: музыка — это то, что игрок настраивает
 * один раз и больше не трогает, поэтому постоянного места в шапке она
 * не занимает. Внутри же — и переключатель щелчков интерфейса: два звука живут
 * в одном месте, а не в двух разных кнопках.
 *
 * На широком экране панель выезжает вправо, на телефоне — падает вниз
 * столбиком: в строку рядом с шестерёнкой и ачивками она там не помещается.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Track } from '../music.ts'
import { Icon } from '../ui/icons.tsx'

interface Props {
  accent: string
  /** Щелчки интерфейса. */
  sound: boolean
  music: number
  musicOn: boolean
  track: Track | null
  onSound: () => void
  onMusic: (volume: number) => void
  onMusicToggle: () => void
  onNext: () => void
  /** Заглушить или вернуть всё сразу — третья ступень кнопки. */
  onMute: (muted: boolean) => void
}

const CHIP =
  'flex cursor-pointer items-center justify-center rounded-lg border border-[#26262c] ' +
  'bg-[#121216] p-1.5 text-[#a1a1ab] transition-colors hover:border-[#3a3a44] hover:text-[#e7e7ea]'

const BOX = 'rounded-lg border border-[#26262c] bg-[#121216]'

export function Volume({
  accent,
  sound,
  music,
  musicOn,
  track,
  onSound,
  onMusic,
  onMusicToggle,
  onNext,
  onMute,
}: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Клик мимо закрывает панель: она перекрывает заголовок PR, и оставлять её
  // висеть после того, как громкость выставлена, незачем.
  useEffect(() => {
    if (!open) return

    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  /**
   * Кнопка ходит по кругу из трёх ступеней: звук включён → открыта настройка →
   * всё выключено → снова включён. Так одна кнопка и глушит, и настраивает,
   * и не требует помнить, где что лежит.
   */
  const muted = !sound && !musicOn
  const step = muted ? 2 : open ? 1 : 0
  const STEP_HINT = ['Настроить звук', 'Выключить звук', 'Включить звук']

  function cycle() {
    if (step === 0) {
      setOpen(true)
      return
    }
    setOpen(false)
    onMute(step === 1)
  }

  const percent = Math.round(music * 100)
  const vars = {
    '--vol-accent': musicOn ? accent : '#4a4a54',
    '--vol-pos': `${percent}%`,
  } as CSSProperties

  /** Одна начинка на обе раскладки: отличаются только направление и размеры. */
  const controls = (vertical: boolean) => (
    <>
      <button
        onClick={onMusicToggle}
        title={musicOn ? 'Выключить музыку' : 'Включить музыку'}
        className="cursor-pointer transition-colors"
        style={{ color: musicOn ? accent : '#4a4a54' }}
      >
        <Icon name="music" size={13} />
      </button>

      {/* Столбиком тот же ползунок, просто повёрнутый: у вертикального range
          трек и бегунок в каждом браузере съезжают по-своему. */}
      <span className={vertical ? 'relative h-[92px] w-[18px]' : 'contents'}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(e) => onMusic(Number(e.target.value) / 100)}
          aria-label="Громкость музыки"
          className={`vol-range w-[92px] cursor-pointer ${
            vertical ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90' : ''
          }`}
          style={vars}
        />
      </span>

      <span className="w-[26px] shrink-0 text-center font-mono text-[10px] text-[#6b6b77] tabular-nums">
        {percent}
      </span>

      <button
        onClick={onNext}
        title={track ? `Играет: ${track.title}` : 'Следующий трек'}
        className="cursor-pointer text-[#6b6b77] transition-colors hover:text-[#e7e7ea]"
      >
        <Icon name="skip-forward" size={12} />
      </button>

      <span className={vertical ? 'my-0.5 h-px w-4 bg-[#26262c]' : 'mx-0.5 h-4 w-px bg-[#26262c]'} />

      <button
        onClick={onSound}
        title={sound ? 'Выключить щелчки' : 'Включить щелчки'}
        className="cursor-pointer font-mono text-[10px] tracking-[.1em] uppercase transition-colors"
        style={{ color: sound ? accent : '#4a4a54' }}
      >
        sfx
      </button>
    </>
  )

  return (
    <div ref={box} className="relative flex items-center">
      <button
        onClick={cycle}
        title={STEP_HINT[step]}
        aria-label={STEP_HINT[step]}
        aria-expanded={open}
        className={CHIP}
        style={open ? { borderColor: `${accent}77`, color: accent } : undefined}
      >
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={14} />
      </button>

      {/* Телефон: столбик под кнопкой, поверх страницы. */}
      <div
        inert={!open}
        className="absolute top-full right-0 z-50 mt-2 origin-top-right transition-[opacity,transform] duration-200 sm:hidden"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1)' : 'scale(.9)',
          pointerEvents: open ? undefined : 'none',
        }}
      >
        <div className={`flex flex-col items-center gap-2 px-1.5 py-2 ${BOX}`}>{controls(true)}</div>
      </div>

      {/* Широкий экран: панель выезжает вправо, прямо в строке шапки. */}
      <div
        inert={!open}
        className="hidden overflow-hidden transition-[max-width,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] sm:block"
        style={{ maxWidth: open ? 260 : 0, opacity: open ? 1 : 0 }}
      >
        <div className={`ml-2 flex items-center gap-2 py-1 pr-1.5 pl-2 ${BOX}`}>
          {controls(false)}
        </div>
      </div>
    </div>
  )
}
