import { useState } from 'react'
import { rank } from '../ranks.ts'
import { buildShare, copy, formatTime, isWin } from '../share.ts'
import { betterThan, plural, THIN_SAMPLE, type Stats } from '../stats.ts'
import type { Outcome, Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { mix } from '../ui/color.ts'
import { Button } from '../ui/kit.tsx'
import { OutcomeTile } from '../ui/outcome.tsx'

export interface Played {
  task: Task
  outcome: Outcome
  score: number
}

interface Props {
  mode: 'daily' | 'endless' | 'set'
  day: string
  history: Played[]
  seconds: number
  newRecord: boolean
  lifetime: number
  accent: string
  stats: Stats | null
  onHome: () => void
}

const LABEL: Record<Outcome, string> = {
  found: 'нашёл',
  partial: 'нашёл не всё',
  'clean-correct': 'было чисто',
  missed: 'уехало в прод',
  'false-accusation': 'обвинил зря',
}


export function Summary({
  mode,
  day,
  history,
  seconds,
  newRecord,
  lifetime,
  accent,
  stats,
  onHome,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)

  const total = history.reduce((s, r) => s + r.score, 0)
  const wins = history.filter((r) => isWin(r.outcome)).length
  const share = buildShare(day, history.map((r) => r.outcome), seconds)
  const r = rank(lifetime)
  const better = betterThan(stats, wins, history.length)

  async function onShare() {
    if (await copy(share)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setFallback(share)
    }
  }

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-[26px]">
      <div className="rounded-[18px] border border-[#26262c] bg-[linear-gradient(160deg,#15151c,#0e0e12)] p-6 text-center">
        <p className="m-0 font-mono text-[11px] tracking-[.2em] uppercase text-[#5c5c66]">
          отчёт по проверке
        </p>
        <h2 className="font-display mt-2.5 text-[clamp(24px,5vw,34px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
          {mode === 'endless' ? 'Три инцидента — тебя отстранили' : 'Проверка окончена'}
        </h2>

        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {history.map((h, i) => (
            <OutcomeTile key={i} outcome={h.outcome} size={54} delay={i * 90} />
          ))}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-4.5 font-mono text-[13px] text-[#8b8b95]">
          <span>
            <span className="font-bold text-[#f2f2f5]">{wins}</span>/{history.length} найдено
          </span>
          <span>
            <span className="font-bold text-[#f2f2f5]">{total}</span>{' '}
            {plural(total, 'очко', 'очка', 'очков')}
          </span>
          <span className="font-bold text-[#f2f2f5]">{formatTime(seconds)}</span>
        </div>

        {newRecord && <p className="mt-2 font-mono text-[13px] text-[#34d399]">личный рекорд</p>}

        {better && (
          <p className="mt-2 text-sm text-[#9a9aa4]">
            {better.pct >= 50
              ? `Лучше, чем у ${better.pct}% сыгравших сегодня.`
              : `Столько же или больше набрали ${100 - better.pct}% сыгравших.`}
            {better.n < THIN_SAMPLE && (
              <span className="text-[#6b6b77]">
                {' '}
                Всего {better.n} {plural(better.n, 'заход', 'захода', 'заходов')}.
              </span>
            )}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[#26262c] bg-[#111116]">
        {history.map((h, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-[#1f1f26]' : ''}`}
          >
            <OutcomeTile outcome={h.outcome} size={18} />
            <span className="flex-1 text-sm text-[#d8d8dd]">{h.task.title}</span>
            <span className="font-mono text-xs text-[#6b6b77]">{LABEL[h.outcome]}</span>
            <span className="min-w-[40px] text-right font-mono text-[13px] tabular-nums text-[#e7e7ea]">
              {h.score}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 rounded-[14px] border border-[#26262c] bg-[#101014] px-5 py-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <span className="flex items-center gap-2 font-semibold text-[#f2f2f5]">
            <span style={{ color: accent }}>
              <Icon name={r.icon} size={16} />
            </span>
            {r.title}
          </span>
          <span className="font-mono text-[11px] text-[#4ade80]">+{total} опыта</span>
        </div>

        <div className="h-2.5 overflow-hidden rounded-[4px] bg-[#1c1c22] shadow-[inset_0_0_0_1px_#26262c]">
          <div
            className="h-full rounded-[3px] transition-[width] duration-[800ms] ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              width: `${r.pct}%`,
              backgroundImage: `repeating-linear-gradient(90deg, transparent 0 24px, #0e0e12 24px 27px), linear-gradient(90deg,${mix(accent, 0.8)},${accent})`,
              boxShadow: `0 0 14px ${accent}55`,
            }}
          />
        </div>

        <span className="font-mono text-[11px] text-[#6b6b77]">{r.hint}</span>
      </div>

      {mode === 'daily' && (
        <pre className="overflow-x-auto rounded-[14px] border border-[#26262c] bg-[#111116] p-4 text-center font-mono text-sm leading-7 text-[#d8d8dd]">
          {share}
        </pre>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {mode === 'daily' && (
          <Button accent={accent} icon="share-2" onClick={onShare}>
            {copied ? 'Скопировано' : 'Поделиться результатом'}
          </Button>
        )}
        <Button variant="secondary" accent={accent} onClick={onHome}>
          На главную
        </Button>
      </div>

      {fallback && (
        <p className="text-center text-sm text-[#fbbf24]">
          Буфер обмена недоступен — скопируй текст выше руками.
        </p>
      )}
    </div>
  )
}
