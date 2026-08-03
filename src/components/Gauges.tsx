/**
 * Три шкалы прода в шапке смены.
 *
 * Читаться они должны без легенды, поэтому у каждой свой язык: здоровье —
 * полоса, которая краснеет к концу; скорость — полоса в цвет агента; долг —
 * не полоса вовсе, а счётчик с жуком. Одинаковых полос подряд быть не должно,
 * иначе игрок их не различает и перестаёт смотреть.
 */

import { Icon } from '../ui/icons.tsx'

interface Props {
  health: number
  velocity: number
  /**
   * Шаг здоровья за прошлый ход. В смене показывается вместо счётчика мин:
   * число «в проде 3» — это готовый ответ «ты пропустил три раза», а наклон
   * заставляет догадываться. См. «Слепая смена — Ревью за ИИ».
   */
  delta: number
  accent: string
  /** Короткая подпись под шкалами — на широком экране. */
  compact?: boolean
}

/** Здоровье меняет цвет само: цифру на полоске в шапке никто читать не будет. */
function healthColor(health: number): string {
  if (health <= 25) return '#f87171'
  if (health <= 55) return '#fb923c'
  return '#34d399'
}

function Bar({ value, color, width }: { value: number; color: string; width: number }) {
  return (
    <span
      className="inline-block h-1.5 overflow-hidden rounded-full bg-[#26262c]"
      style={{ width }}
    >
      <span
        className="block h-full transition-[width,background] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </span>
  )
}

export function Gauges({ health, velocity, delta, accent, compact = false }: Props) {
  const width = compact ? 56 : 88
  // Заметная просадка — это уже не «где-то что-то течёт», а «горит».
  const steep = delta <= -1.5

  return (
    <div className="flex items-center gap-3.5">
      <div className="flex items-center gap-[7px]" title={`Здоровье прода ${Math.round(health)}`}>
        <span style={{ color: healthColor(health) }}>
          <Icon name="heart-pulse" size={13} />
        </span>
        <Bar value={health} color={healthColor(health)} width={width} />
      </div>

      <div className="flex items-center gap-[7px]" title={`Скорость команды ${Math.round(velocity)}`}>
        <span style={{ color: accent }}>
          <Icon name="zap" size={13} />
        </span>
        <Bar value={velocity} color={accent} width={width} />
      </div>

      <div
        className="flex items-center gap-1.5 font-mono text-[11px]"
        title="Сколько здоровья прода ушло за прошлый ход"
        style={{ color: delta < 0 ? (steep ? '#f87171' : '#fbbf24') : '#4a4a54' }}
      >
        <Icon name={steep ? 'circle-alert' : 'timer'} size={13} />
        <span className="tabular-nums">{delta === 0 ? '±0' : delta}</span>
      </div>
    </div>
  )
}
