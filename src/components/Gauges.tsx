/**
 * Три шкалы прода в шапке смены.
 *
 * Читаться они должны без легенды, поэтому у каждой свой язык: здоровье —
 * полоса, которая краснеет к концу; скорость — полоса в цвет агента; долг —
 * не полоса вовсе, а счётчик с жуком. Одинаковых полос подряд быть не должно,
 * иначе игрок их не различает и перестаёт смотреть.
 */

import type { ProdState } from '../defects.ts'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Tip } from '../ui/kit.tsx'

/**
 * Состояние прода словом, а не числом. Сколько именно мин лежит — игрок
 * не знает и знать не должен, но «есть незакрытое» и «горит прямо сейчас» —
 * это разные вещи, и путать их нельзя.
 */
const STATE: Record<ProdState, { label: string; color: string; icon: IconName }> = {
  clean: { label: 'чисто', color: '#4a4a54', icon: 'shield-check' },
  leaking: { label: 'подтекает', color: '#fbbf24', icon: 'bug' },
  falling: { label: 'падает', color: '#f87171', icon: 'siren' },
}

interface Props {
  health: number
  velocity: number
  state: ProdState
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

export function Gauges({ health, velocity, state, delta, accent, compact = false }: Props) {
  const width = compact ? 56 : 88
  const mode = STATE[state]

  return (
    <div className="flex items-center gap-3.5">
      <Tip text={`Здоровье прода ${Math.round(health)} из 100`}>
        <span className="flex items-center gap-[7px]">
          <span style={{ color: healthColor(health) }}>
            <Icon name="heart-pulse" size={13} />
          </span>
          <Bar value={health} color={healthColor(health)} width={width} />
        </span>
      </Tip>

      <Tip text={`Скорость команды ${Math.round(velocity)} из 100.
Упадёт до нуля — снимут с ревью.`}>
        <span className="flex items-center gap-[7px]">
          <span style={{ color: accent }}>
            <Icon name="zap" size={13} />
          </span>
          <Bar value={velocity} color={accent} width={width} />
        </span>
      </Tip>

      <Tip
        text={`Прод ${mode.label}.
За прошлый ход ${delta === 0 ? 'без изменений' : delta}.`}
      >
      <span
        className="flex items-center gap-1.5 font-mono text-[11px]"
        style={{ color: mode.color }}
      >
        <span style={{ animation: state === 'falling' ? 'pulseRed 1.2s ease-in-out infinite' : undefined }}>
          <Icon name={mode.icon} size={13} />
        </span>
        <span className="hidden sm:inline">{mode.label}</span>
        {delta < 0 && <span className="tabular-nums opacity-70">{delta}</span>}
      </span>
      </Tip>
    </div>
  )
}
