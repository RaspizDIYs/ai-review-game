import { useEffect, useRef, useState } from 'react'
import type { Coverage } from '../round.ts'
import { hits } from '../round.ts'
import type { ReasonOption } from '../reason.ts'
import { ROUND_SECONDS } from '../scoring.ts'
import { foundShare, plural, THIN_SAMPLE, type Stats } from '../stats.ts'
import type { Outcome, Task } from '../types'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'
import { DiffView, type LineState } from './DiffView.tsx'

interface Head {
  title: string
  sub: string
  color: string
  icon: IconName
  stamp: string
}

const HEAD: Record<Outcome, Head> = {
  found: {
    title: 'Нашёл',
    sub: 'В прод не уехало.',
    color: '#34d399',
    icon: 'target',
    stamp: 'НАЙДЕНО',
  },
  partial: {
    title: 'Нашёл не всё',
    sub: 'Часть подлянки ты увидел. Остальное уехало.',
    color: '#fbbf24',
    icon: 'target',
    stamp: 'ЧАСТИЧНО',
  },
  missed: {
    title: 'Уехало в прод',
    sub: 'Ночью инцидент. Следующий раунд играешь уставшим — времени меньше.',
    color: '#f87171',
    icon: 'siren',
    stamp: 'В ПРОДЕ',
  },
  'clean-correct': {
    title: 'Здесь и правда было чисто',
    sub: 'Пропустить нормальный код — тоже навык.',
    color: '#34d399',
    icon: 'shield-check',
    stamp: 'АПРУВ',
  },
  'false-accusation': {
    title: 'Обвинил невиновного',
    sub: 'Подлянки не было. Заблокированный на ровном месте мёрдж стоит денег не меньше пропущенного бага.',
    color: '#fbbf24',
    icon: 'gavel',
    stamp: 'МИМО',
  },
}

interface Props {
  task: Task
  tokens: Task['tokens']
  outcome: Outcome
  score: number
  /** Все отмеченные строки последней отправки. */
  picks: number[]
  wrongPicks: number[]
  coverage: Coverage | null
  secondsLeft: number
  reason: ReasonOption | null
  rightReason: ReasonOption | null
  stats: Stats | null
  hasNext: boolean
  /** Чем подписать кнопку, если «следующий PR» — неправда (смена). */
  nextLabel?: string
  onNext: () => void
}

/** Очки набегают, а не появляются: секунда, за которую видно, из чего они. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const started = performance.now()
    const step = () => {
      const p = Math.min(1, (performance.now() - started) / 700)
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return value
}

export function Verdict({
  task,
  tokens,
  outcome,
  score,
  picks,
  wrongPicks,
  coverage,
  secondsLeft,
  reason,
  rightReason,
  stats,
  hasNext,
  nextLabel,
  onNext,
}: Props) {
  const animated = useCountUp(score)
  const share = foundShare(stats, task.id)

  // Два отдельных случая, у которых свой заголовок.
  //
  // «Нашёл, но с лишними» — подлянка вся, но сверху навешано обвинений.
  // «Обвинил половину файла» — обвинений больше, чем подлянок: формально
  // строку задел, но это не находка, и говорить «подлянки не было» здесь
  // неправда, она была.
  const head =
    outcome === 'partial' && coverage && coverage.found >= coverage.total
      ? {
          ...HEAD.partial,
          title: 'Нашёл, но с лишними',
          sub: 'Подлянку ты угадал. Остальные обвинения — мимо: команда потеряла время.',
          stamp: 'С ЛИШНИМИ',
        }
      : outcome === 'false-accusation' && !task.clean
        ? {
            ...HEAD['false-accusation'],
            title: 'Обвинил половину файла',
            sub: 'Подлянка тут была, и ты её задел — вместе со всем остальным. Ревью, после которого нужно перепроверять каждую строку, не стоит ничего.',
            stamp: 'ВСЛЕПУЮ',
          }
        : HEAD[outcome]

  const marks = new Map<number, LineState>()
  for (const d of task.decoys) marks.set(d.line, 'decoy')
  for (const line of wrongPicks) marks.set(line, 'wrong')
  for (const line of picks) {
    if (!task.bugs.some((b) => hits(b, line))) marks.set(line, 'wrong')
  }
  // Ненайденная подлянка обводится пунктиром: её показали, но она не твоя.
  for (const b of task.bugs) {
    marks.set(b.line, picks.some((l) => hits(b, l)) ? 'correct' : 'missed-bug')
  }

  const clicked = [...wrongPicks, ...picks]
  const clickedDecoys = task.decoys.filter((d) => clicked.includes(d.line))

  const full = coverage ? coverage.found === coverage.total && coverage.extras === 0 : true
  const coverColor = full ? '#34d399' : '#fbbf24'

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="relative overflow-hidden rounded-2xl border border-[#26262c] bg-[#111116] px-[22px] pt-[22px] pb-12">
        <div
          className="pointer-events-none absolute inset-x-[-20%] top-[-60%] h-[180px]"
          style={{ background: `radial-gradient(closest-side, ${head.color}22, transparent)` }}
        />
        {outcome === 'missed' && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[7px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(248,113,113,.5) 0 9px, rgba(248,113,113,0) 9px 18px)',
            }}
          />
        )}

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex-[1_1_260px]">
            <div className="flex items-center gap-2.5">
              <span style={{ color: head.color }}>
                <Icon name={head.icon} size={24} />
              </span>
              <h2
                className="font-display m-0 text-[clamp(22px,4vw,30px)] font-bold tracking-[-.02em]"
                style={{ color: head.color }}
              >
                {head.title}
              </h2>
            </div>

            <p className="mt-2 max-w-[440px] text-sm leading-[1.55] text-[#9a9aa4]">{head.sub}</p>

            {!task.clean && coverage && (
              <span
                className="mt-3 inline-block rounded-full px-3 py-1 font-mono text-xs tracking-[.06em]"
                style={{ color: coverColor, border: `1px solid ${coverColor}59` }}
              >
                строк подлянки: {coverage.found} из {coverage.total}
                {coverage.extras > 0 && ` · лишних: ${coverage.extras}`}
              </span>
            )}
          </div>

          <div className="text-right">
            <div
              className="font-mono text-[clamp(28px,6vw,40px)] font-bold tabular-nums"
              style={{ color: head.color }}
            >
              +{animated}
            </div>
            <div className="font-mono text-[11px] text-[#5c5c66]">
              сложность {task.difficulty} ·{' '}
              {Math.round(Math.max(0.2, secondsLeft / ROUND_SECONDS) * 100)}% времени
            </div>
          </div>
        </div>

        <div
          className="absolute right-5 bottom-3 rounded-md px-3 py-[5px] font-mono text-[13px] font-bold tracking-[.24em] opacity-[.34]"
          style={{
            color: head.color,
            border: `2.5px solid ${head.color}`,
            animation: 'stampIn .55s cubic-bezier(.2,1.1,.3,1) both',
          }}
        >
          {head.stamp}
        </div>
      </div>

      {share && (
        <p className="text-sm text-[#6b6b77]">
          {task.clean
            ? `Здесь не попались ${share.found}% игроков.`
            : `Эту подлянку находят ${share.found}% игроков.`}
          {share.n < THIN_SAMPLE && (
            <span className="text-[#4a4a54]">
              {' '}
              Пока сыграли всего {share.n} {plural(share.n, 'человек', 'человека', 'человек')}.
            </span>
          )}
        </p>
      )}

      {reason && !reason.right && (
        <div className="rounded-[14px] border border-[rgba(251,191,36,.28)] bg-[rgba(245,158,11,.06)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[#fbbf24]">
              <Icon name="circle-alert" size={15} />
            </span>
            <span className="font-mono text-[11px] tracking-[.1em] uppercase text-[rgba(251,191,36,.85)]">
              строку нашёл, причину — нет
            </span>
          </div>
          <p className="m-0 leading-[1.55] text-[#d8d8dd]">
            Ты выбрал «{reason.text}», а дело в другом:{' '}
            <span className="text-[#f2f2f5]">{rightReason?.text.toLowerCase()}</span>. Очки
            за раунд поэтому вполовину.
          </p>
        </div>
      )}

      <DiffView diff={task.diff} tokens={tokens} marks={marks} accent={head.color} disabled />

      {task.bugs.map((bug) => (
        <div
          key={bug.line}
          className="rounded-[14px] border border-[rgba(52,211,153,.25)] bg-[rgba(16,185,129,.06)] p-4"
        >
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[#34d399]">
              <Icon name="bug" size={15} />
            </span>
            <span className="font-mono text-[11px] tracking-[.1em] uppercase text-[rgba(52,211,153,.85)]">
              строка {bug.line}
              {bug.kind === 'missing' && ' · здесь не хватает кода'}
            </span>
            <span className="rounded-full border border-[rgba(52,211,153,.3)] px-2 py-px font-mono text-[11px] text-[#6ee7b7]">
              {bug.tag}
            </span>
          </div>
          <p className="m-0 leading-[1.55] text-[#e7e7ea]">{bug.explain}</p>
          <p className="mt-3 text-sm leading-[1.55] text-[#9a9aa4]">{bug.consequence}</p>
        </div>
      ))}

      {!task.clean &&
        clickedDecoys.map((decoy) => (
          <div
            key={decoy.line}
            className="rounded-[14px] border border-[rgba(251,191,36,.28)] bg-[rgba(245,158,11,.06)] p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[#fbbf24]">
                <Icon name="circle-alert" size={15} />
              </span>
              <span className="font-mono text-[11px] tracking-[.1em] uppercase text-[rgba(251,191,36,.85)]">
                ты выбрал строку {decoy.line}
              </span>
            </div>
            <p className="m-0 leading-[1.55] text-[#d8d8dd]">{decoy.why}</p>
          </div>
        ))}

      {task.clean && (
        <div className="rounded-[14px] border border-[#26262c] bg-[#111116] p-4">
          <p className="mb-2.5 font-mono text-[11px] tracking-[.14em] uppercase text-[#5c5c66]">
            Что здесь смущало
          </p>
          <ul className="flex flex-col gap-2.5">
            {task.decoys.map((d) => (
              <li key={d.line} className="flex gap-2.5 text-sm leading-[1.5] text-[#9a9aa4]">
                <span className="shrink-0 font-mono text-[#fbbf24]">{d.line}:</span>
                <span>{d.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button accent={head.color} onClick={onNext} iconAfter="arrow-right" autoFocus>
        {nextLabel ?? (hasNext ? 'Следующий PR' : 'Завершить проверку')}
      </Button>
    </div>
  )
}
