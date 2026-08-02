/**
 * Кирпичи оболочки: кнопки-«игрушки» с толстым нижним ребром, панели и портреты.
 *
 * Акцент приезжает пропсом, а не лежит в теме: цвет интерфейса меняется под
 * агента раунда, и все кнопки обязаны перекрашиваться вместе с ним.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Icon, type IconName } from './icons.tsx'
import { mix } from './color.ts'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  accent?: string
  icon?: IconName
  iconAfter?: IconName
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

const BASE =
  'w-full rounded-xl px-6 py-4 font-mono text-[13px] font-bold uppercase tracking-[.12em] ' +
  'flex items-center justify-center gap-2.5 cursor-pointer select-none ' +
  'transition-[transform,box-shadow,filter] duration-100 ' +
  'hover:brightness-110 active:translate-y-[4px] active:shadow-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ' +
  'disabled:cursor-default disabled:brightness-75 disabled:active:translate-y-0'

export function Button({
  children,
  onClick,
  variant = 'primary',
  accent = '#a78bfa',
  icon,
  iconAfter,
  disabled,
  autoFocus,
  className = '',
}: ButtonProps) {
  const style: CSSProperties =
    variant === 'primary'
      ? {
          background: accent,
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 46%)',
          color: '#0b0b0f',
          border: `2px solid ${mix(accent, 0.82)}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.5), 0 5px 0 ${mix(accent, 0.42)}, 0 12px 26px ${accent}33`,
        }
      : {
          background: '#15151b',
          backgroundImage: 'linear-gradient(180deg,#1d1d25,#131319)',
          color: '#d8d8dd',
          border: '2px solid #33333d',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 5px 0 #0c0c10',
        }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      style={style}
      className={`${BASE} ${variant === 'ghost' ? 'w-auto self-start px-5 py-3' : ''} ${className}`}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={17} />}
    </button>
  )
}

/** Панель — основной строительный блок: рамка, тёмный фон, скруглённые углы. */
export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={style}
      className={`rounded-2xl border border-[#26262c] bg-[#111116] ${className}`}
    >
      {children}
    </div>
  )
}

/** Надпись-кикер: моно, вразрядку, капсом. В макете она на каждом экране. */
export function Kicker({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <p
      style={style}
      className={`font-mono text-[10px] tracking-[.18em] uppercase text-[#5c5c66] ${className}`}
    >
      {children}
    </p>
  )
}

/**
 * Портрет агента. Картинка кладётся в `public/agents/<slug>.png`; пока её нет —
 * рисуется монограмма в цвет агента. Игра не должна ждать художника.
 */
export function AgentAvatar({
  slug,
  name,
  color,
  size,
  className = '',
  style,
}: {
  slug: string
  name: string
  color: string
  size: number
  className?: string
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${color}66`,
        background: `radial-gradient(120% 120% at 50% 0%, ${color}2e, #14141a 70%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 0 ${Math.round(size / 5)}px ${color}26`,
        ...style,
      }}
    >
      {failed ? (
        <span
          className="font-display font-bold"
          style={{ color, fontSize: size * 0.4, letterSpacing: '-.02em' }}
        >
          {name.slice(0, 1)}
        </span>
      ) : (
        <img
          src={`${import.meta.env.BASE_URL}agents/${slug}.png`}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  )
}
