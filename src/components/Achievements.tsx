import { ACHIEVEMENTS, ownedCount } from '../achievements.ts'
import { Icon } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'

interface Props {
  unlocked: string[]
  accent: string
  onBack: () => void
}

export function Achievements({ unlocked, accent, onBack }: Props) {
  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-[18px] px-[18px] pt-[26px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[26px] font-bold tracking-[-.02em] text-[#f4f4f6]">
          Ачивки
        </h2>
        <span className="font-mono text-xs text-[#6b6b77]">
          {ownedCount(unlocked)} из {ACHIEVEMENTS.length} · за языки, находки и упорство
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        {ACHIEVEMENTS.map((a) => {
          const on = unlocked.includes(a.id)

          return (
            <div
              key={a.id}
              className="flex items-start gap-3.5 rounded-2xl p-4"
              style={{
                border: on ? `1.5px solid ${accent}55` : '1.5px solid #1f1f26',
                background: on ? `linear-gradient(180deg, ${accent}14, #0f0f14 70%)` : '#0c0c10',
                boxShadow: on
                  ? 'inset 0 1px 0 rgba(255,255,255,.06), 0 5px 0 #0b0b0e'
                  : '0 5px 0 #09090c',
              }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                style={{
                  border: on ? `1.5px solid ${accent}66` : '1.5px solid #202027',
                  background: on
                    ? `radial-gradient(120% 130% at 50% 0%, ${accent}33, #14141a 72%)`
                    : 'repeating-linear-gradient(135deg,#101014 0 5px,#0c0c10 5px 10px)',
                  boxShadow: on
                    ? `inset 0 1px 0 rgba(255,255,255,.14), 0 0 18px ${accent}1f`
                    : 'inset 0 1px 0 rgba(255,255,255,.03)',
                  color: on ? accent : '#33333c',
                }}
              >
                {on && a.badge ? (
                  <span className="font-mono text-[13px] font-bold lowercase">{a.badge}</span>
                ) : (
                  <Icon name={on ? a.icon : 'lock'} size={21} />
                )}
              </span>

              <div className="flex-1">
                <div
                  className="font-display text-sm font-bold tracking-[-.01em]"
                  style={{ color: on ? '#f2f2f5' : '#55555f' }}
                >
                  {a.title}
                </div>
                <div className="mt-[5px] text-[13px] leading-[1.45] text-[#71717a]">{a.desc}</div>
                <span
                  className="mt-[9px] inline-block rounded-full px-2.5 py-px font-mono text-[10px] tracking-[.16em] uppercase"
                  style={{
                    color: on ? accent : '#3f3f48',
                    border: `1px solid ${on ? accent + '44' : '#1f1f26'}`,
                  }}
                >
                  {on ? 'получена' : 'закрыта'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <Button variant="ghost" accent={accent} onClick={onBack}>
        Назад
      </Button>
    </div>
  )
}
