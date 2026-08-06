/**
 * Ответ ИИ на обвинение.
 *
 * Всплывает после отправки — и всегда одинаково подобострастно, прав игрок
 * или нет. Информации в реплике ровно ноль, поэтому её можно показывать
 * даже в слепой смене; но ровно поэтому же она не имеет права закрывать
 * собой хоть что-нибудь важное.
 *
 * Отсюда два разных места, а не одно компромиссное:
 *
 * - **широкий экран** — правое поле рядом с колонкой контента. Там пусто,
 *   и реплика не перекрывает вообще ничего;
 * - **телефон** — узкая полоса сразу под шапкой. Свободного места там нет
 *   нигде, поэтому выбрано наименее ценное: подсказка «кликни строку»,
 *   которую игрок к этому моменту уже прочитал. Внизу жить нельзя — там
 *   кнопка следующего шага, посередине тоже: там текст разбора.
 *
 * Красится плотно, в цвет агента, тем же набором, что и кнопки игры:
 * полупрозрачная плашка просвечивала насквозь и читалась мутью.
 *
 * См. заметку «Дополнительные идеи - Ревью за ии», часть 1.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { Agent } from '../agents.ts'
import { mix } from '../ui/color.ts'
import { AgentAvatar } from '../ui/kit.tsx'

/** Ниже этого реплика встаёт под шапку, выше — уходит в правое поле. */
const WIDE = '(min-width: 1024px)'

export function Reply({
  agent,
  line,
  anonymous = false,
  accent,
}: {
  agent: Agent
  line: string
  /** В смене автор неизвестен: подписывать реплику именем нельзя. */
  anonymous?: boolean
  accent: string
}) {
  const color = anonymous ? accent : agent.color
  const name = anonymous ? 'ai' : agent.name

  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE).matches,
  )
  /** Высота шапки: она меняется — внутри раунда у неё вторая строка со шкалами. */
  const [under, setUnder] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const sync = () => {
      setWide(mq.matches)
      setUnder(document.getElementById('chrome')?.getBoundingClientRect().height ?? 0)
    }
    sync()
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  const place: CSSProperties = wide
    ? { right: 16, top: '50%', width: 'min(320px, calc(100vw - 32px))' }
    : { left: 12, right: 12, top: under + 10 }

  return (
    <div
      className="pointer-events-none fixed z-60"
      style={{
        ...place,
        animation: `${wide ? 'replyAside' : 'replyUnder'} .42s cubic-bezier(.2,1.1,.3,1) both`,
      }}
      role="status"
    >
      <div
        // Тот же «игрушечный» набор, что у основных кнопок: плотная заливка,
        // блик сверху, тёмное ребро снизу.
        className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
        style={{
          background: color,
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 46%)',
          border: `2px solid ${mix(color, 0.82)}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.5), 0 5px 0 ${mix(color, 0.42)}, 0 14px 30px rgba(0,0,0,.5)`,
        }}
      >
        {/* Портрет на светлом фоне обводим тёмным, а не цветом агента:
            цветное кольцо на цветной заливке пропадает. */}
        <AgentAvatar
          slug={anonymous ? null : agent.slug}
          name={anonymous ? '?' : name}
          color="#0b0b0f"
          size={32}
          style={{ background: 'rgba(0,0,0,.28)' }}
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[9px] tracking-[.16em] uppercase text-[#0b0b0f] opacity-60">
            {name}
          </span>
          {/* Длинную фразу обрезаем двумя строками: реплика — шутка, а не текст,
              ради которого стоит закрывать пол-экрана. */}
          <span className="line-clamp-2 text-[13px] leading-[1.35] font-medium text-[#0b0b0f]">
            {line}
          </span>
        </span>
      </div>
    </div>
  )
}
