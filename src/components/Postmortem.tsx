/**
 * Разбор одного пул-реквеста после смены.
 *
 * Журнал в отчёте говорит «#1409 рванул в проде» — и на этом обрывается.
 * Здесь тот же код открывается заново, но уже с ответами: где была подлянка,
 * почему она подлянка и чем кончилась в проде. Плюс история самого PR: когда
 * ты его смёржил, сколько раз он ронял прод и что вышло, когда ты его чинил.
 *
 * Экран доступен только когда игра кончилась и правда уже раскрыта, — иначе
 * он был бы дырой в слепоте размером с саму игру.
 */

import type { RepairResult, ShiftEvent } from '../shift.ts'
import type { Task } from '../types'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'
import { DiffView, type LineState } from './DiffView.tsx'

interface Props {
  task: Task
  tokens: Task['tokens']
  pr: number
  /** События именно этого PR, в порядке смены. */
  events: ShiftEvent[]
  /** PR уже закрыт: показываем это как исправленный код. */
  fixed: boolean
  /** Закрыт уборкой, а не твоими руками — текст разбора другой. */
  byCleanup: boolean
  accent: string
  onBack: () => void
}

const REPAIR: Record<RepairResult, string> = {
  cured: 'починил',
  failed: 'полез, но не туда — подлянка осталась',
  broke: 'полез в чистый код и сломал его',
}

function line(event: ShiftEvent): { text: string; icon: IconName; color: string } {
  switch (event.kind) {
    case 'merged':
      return { text: 'ты его пропустил в прод', icon: 'git-pull-request', color: '#8b8b95' }
    case 'blocked':
      return { text: 'ты отправил его на переделку', icon: 'shield-check', color: '#34d399' }
    case 'incident':
      return { text: 'уронил прод', icon: 'siren', color: '#f87171' }
    case 'repair':
      return { text: REPAIR[event.result], icon: 'hammer', color: '#c084fc' }
    case 'cleanup':
      return { text: 'разгребли уборкой', icon: 'sparkles', color: '#7c9cf5' }
    case 'watch':
      return {
        text: `ты вешал лог на строки ${event.lines.join(', ')}`,
        icon: 'search',
        color: '#2dd4bf',
      }
  }
}

export function Postmortem({
  task,
  tokens,
  pr,
  events,
  fixed,
  byCleanup,
  accent,
  onBack,
}: Props) {
  // Подлянки подсвечиваем все: на этом экране прятать уже нечего.
  // Закрытые — зелёным: строка в проде больше не та, что была.
  const marks = new Map<number, LineState>()
  for (const d of task.decoys) marks.set(d.line, 'decoy')
  for (const b of task.bugs) marks.set(b.line, fixed ? 'correct' : 'missed-bug')

  const tone = fixed
    ? { border: 'rgba(52,211,153,.28)', bg: 'rgba(16,185,129,.06)', text: '#34d399', soft: '#6ee7b7' }
    : { border: 'rgba(248,113,113,.28)', bg: 'rgba(248,113,113,.06)', text: '#f87171', soft: '#fca5a5' }

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="rounded-2xl border border-[#26262c] bg-[#111116] p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[13px] text-[#6b6b77]">#{pr}</span>
          <h1 className="font-display m-0 text-[clamp(19px,3.4vw,25px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
            {task.title}
          </h1>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-[#5c5c66]">
            {task.stack} · сложность {task.difficulty}
          </span>
        </div>

        <p className="mt-2.5 text-sm leading-[1.55] text-[#9a9aa4] italic">«{task.prompt}»</p>

        <div className="mt-4 flex flex-col gap-1.5">
          {events.map((event, i) => {
            const it = line(event)
            return (
              <div key={i} className="flex items-center gap-2.5 text-[13px]">
                <span style={{ color: it.color }}>
                  <Icon name={it.icon} size={14} />
                </span>
                <span className="text-[#d8d8dd]">{it.text}</span>
                <span className="flex-1" />
                <span className="font-mono text-[11px] text-[#4a4a54]">ход {event.turn + 1}</span>
              </div>
            )
          })}
        </div>
      </div>

      <DiffView diff={task.diff} tokens={tokens} marks={marks} accent={accent} disabled />

      {task.bugs.map((bug) => (
        <div
          key={bug.line}
          className="rounded-[14px] p-4"
          style={{ border: `1px solid ${tone.border}`, background: tone.bg }}
        >
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span style={{ color: tone.text }}>
              <Icon name={fixed ? 'check-check' : 'bug'} size={15} />
            </span>
            <span
              className="font-mono text-[11px] tracking-[.1em] uppercase"
              style={{ color: tone.text }}
            >
              строка {bug.line}
              {fixed ? ' · переписана' : bug.kind === 'missing' ? ' · здесь не хватало кода' : ''}
            </span>
            <span
              className="rounded-full px-2 py-px font-mono text-[11px]"
              style={{ border: `1px solid ${tone.border}`, color: tone.soft }}
            >
              {bug.tag}
            </span>
          </div>
          <p className="m-0 leading-[1.55] text-[#e7e7ea]">{bug.explain}</p>
          <p className="mt-3 text-sm leading-[1.55] text-[#9a9aa4]">{bug.consequence}</p>
          {fixed && (
            <p className="mt-3 text-sm leading-[1.55]" style={{ color: tone.soft }}>
              {byCleanup
                ? 'Эту строку разгребли уборкой — заряд ушёл, зато в проде её больше нет.'
                : 'Ты нашёл эту строку и закрыл её своими руками. В проде её больше нет.'}
            </p>
          )}
        </div>
      ))}

      {task.clean && (
        <div className="rounded-[14px] border border-[rgba(52,211,153,.25)] bg-[rgba(16,185,129,.06)] p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[#34d399]">
              <Icon name="shield-check" size={15} />
            </span>
            <span className="font-mono text-[11px] tracking-[.1em] uppercase text-[rgba(52,211,153,.85)]">
              здесь было чисто
            </span>
          </div>
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

      <Button accent={accent} onClick={onBack} autoFocus>
        Назад к отчёту
      </Button>
    </div>
  )
}
