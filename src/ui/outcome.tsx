/**
 * Как выглядит исход раунда: цвет и иконка. Одни и те же в итоге серии,
 * на карточке дня и в списке раундов — иначе игрок учит три разных языка
 * для одного и того же факта.
 */

import type { Outcome } from '../types'
import { Icon, type IconName } from './icons.tsx'

const OUTCOME_TILE: Record<Outcome, { color: string; icon: IconName }> = {
  found: { color: '#34d399', icon: 'target' },
  'clean-correct': { color: '#34d399', icon: 'shield-check' },
  partial: { color: '#fbbf24', icon: 'target' },
  'false-accusation': { color: '#fbbf24', icon: 'gavel' },
  missed: { color: '#f87171', icon: 'siren' },
}

interface Props {
  outcome: Outcome
  /** Сторона плитки. В итоге серии крупные, на карточке дня — мелкие. */
  size: number
  /** Задержка появления: плитки въезжают по очереди, а не все разом. */
  delay?: number
}

export function OutcomeTile({ outcome, size, delay }: Props) {
  const { color, icon } = OUTCOME_TILE[outcome]

  return (
    <span
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3.8),
        border: `1.5px solid ${color}66`,
        backgroundImage: `repeating-linear-gradient(transparent 0 3px, rgba(255,255,255,.02) 3px 4px), radial-gradient(120% 130% at 50% 0%, ${color}33, #14141a 72%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.12), 0 ${Math.max(2, Math.round(size / 11))}px 0 #0b0b0e, 0 0 ${size / 2.5}px ${color}22`,
        color,
        animation:
          delay === undefined
            ? undefined
            : `rowIn .4s cubic-bezier(.2,1.2,.3,1) ${delay}ms both`,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.42)} />
    </span>
  )
}
