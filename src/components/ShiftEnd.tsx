/**
 * Сводка смены.
 *
 * Отвечает на один вопрос: каким прод остался и почему. Поэтому здесь не
 * очки, а журнал — что смёржено, что заблокировано, что рвануло и на каком
 * ходу. Прод переносится в следующую смену, и игрок должен уйти с экрана,
 * понимая, с чем он в неё войдёт.
 */

import type { Summary } from '../prod.ts'
import type { ShiftEvent } from '../shift.ts'
import { plural } from '../stats.ts'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'
import { Gauges } from './Gauges.tsx'

interface Props {
  summary: Summary
  log: ShiftEvent[]
  turns: number
  accent: string
  /** Названия задач по id — журнал хранит только id. */
  titles: Map<string, string>
  /**
   * Показывать ли правду. Пока прод жив, журнал скрыт: иначе после каждой
   * смены игрок узнаёт, где ошибся, и чинить становится нечего — вся слепота
   * держится ровно на этом.
   */
  reveal: boolean
  /** Разобрать завалы. null — чинить нечего или уже некого. */
  onRepair: (() => void) | null
  onNext: (() => void) | null
  onHome: () => void
}

const HEAD: Record<Summary['verdict'], { title: string; hint: string; color: string }> = {
  alive: {
    title: 'Смена сдана',
    hint: 'Прод пережил её и уходит в следующую смену таким, каким ты его оставил.',
    color: '#34d399',
  },
  burned: {
    title: 'Прод не пережил смену',
    hint: 'Накопилось. Ни одна из подлянок не ломала его сразу — сломали все вместе.',
    color: '#f87171',
  },
  fired: {
    title: 'Тебя сняли с ревью',
    hint: 'Прод чист, и это никого не утешило: за смену не уехало ничего.',
    color: '#fbbf24',
  },
}

const EVENT: Record<ShiftEvent['kind'], { icon: IconName; color: string }> = {
  merged: { icon: 'git-pull-request', color: '#8b8b95' },
  blocked: { icon: 'shield-check', color: '#34d399' },
  incident: { icon: 'siren', color: '#f87171' },
  cleanup: { icon: 'sparkles', color: '#7c9cf5' },
  repair: { icon: 'hammer', color: '#c084fc' },
}

function line(event: ShiftEvent, titles: Map<string, string>): string {
  const name = (id: string) => titles.get(id) ?? id

  switch (event.kind) {
    case 'merged':
      return `#${event.pr} смёржен — ${name(event.task)}`
    case 'blocked':
      return `#${event.pr} отправлен на переделку — ${name(event.task)}`
    case 'incident':
      return `#${event.pr} рванул в проде — ${name(event.task)}`
    case 'cleanup':
      return event.task ? `разгребли долг — ${name(event.task)}` : 'профилактика, долга не было'
    case 'repair':
      // Вот здесь и вскрывается, что вышло: до разбора игрок не знал.
      return `чинил #${event.pr} — ${REPAIR_TEXT[event.result]}`
  }
}

const REPAIR_TEXT: Record<'cured' | 'failed' | 'broke', string> = {
  cured: 'починил',
  failed: 'не туда, подлянка осталась',
  broke: 'а там было чисто — сломал',
}

export function ShiftEnd({
  summary,
  log,
  turns,
  accent,
  titles,
  reveal,
  onRepair,
  onNext,
  onHome,
}: Props) {
  const head = HEAD[summary.verdict]
  const incidents = log.filter((e) => e.kind === 'incident').length
  const merged = log.filter((e) => e.kind === 'merged').length

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-[26px]">
      <div className="rounded-[18px] border border-[#26262c] bg-[linear-gradient(160deg,#15151c,#0e0e12)] p-6 text-center">
        <p className="m-0 font-mono text-[11px] tracking-[.2em] uppercase text-[#5c5c66]">
          отчёт по смене
        </p>
        <h2
          className="font-display mt-2.5 text-[clamp(24px,5vw,34px)] font-bold tracking-[-.02em]"
          style={{ color: head.color }}
        >
          {head.title}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[520px] text-sm leading-[1.55] text-[#9a9aa4]">
          {head.hint}
        </p>

        <div className="mt-5 flex justify-center">
          <Gauges
            health={summary.prod.health}
            velocity={summary.prod.velocity}
            delta={0}
            accent={accent}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4.5 font-mono text-[13px] text-[#8b8b95]">
          <span>
            <span className="font-bold text-[#f2f2f5]">{turns}</span>{' '}
            {plural(turns, 'ход', 'хода', 'ходов')}
          </span>
          <span>
            <span className="font-bold text-[#f2f2f5]">{merged}</span> смёржено
          </span>
          <span>
            <span className="font-bold text-[#f2f2f5]">{incidents}</span>{' '}
            {plural(incidents, 'инцидент', 'инцидента', 'инцидентов')}
          </span>
          <span>
            в проде осталось{' '}
            <span className="font-bold text-[#f2f2f5]">{summary.defects}</span>
          </span>
        </div>
      </div>

      {!reveal && (
        <p className="m-0 rounded-[14px] border border-[#26262c] bg-[#111116] px-4 py-3.5 text-sm leading-[1.55] text-[#9a9aa4]">
          Что из этого было ошибкой, а что нет, ты не узнаешь, пока прод жив.
          Есть только он сам: держится — значит, справляешься.
        </p>
      )}

      <div
        className="overflow-hidden rounded-[14px] border border-[#26262c] bg-[#111116]"
        hidden={!reveal}
      >
        {log.map((event, i) => {
          const style = EVENT[event.kind]
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-[#1f1f26]' : ''}`}
            >
              <span style={{ color: style.color }}>
                <Icon name={style.icon} size={15} />
              </span>
              <span className="flex-1 truncate text-sm text-[#d8d8dd]">{line(event, titles)}</span>
              <span className="font-mono text-[11px] whitespace-nowrap text-[#5c5c66]">
                ход {event.turn + 1}
              </span>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {onRepair && (
          <Button accent={accent} onClick={onRepair} autoFocus>
            Разобрать завалы
          </Button>
        )}
        {onNext && (
          <Button variant={onRepair ? 'secondary' : 'primary'} accent={accent} onClick={onNext}>
            Следующая смена
          </Button>
        )}
        <Button variant="secondary" accent={accent} onClick={onHome}>
          На главную
        </Button>
      </div>
    </div>
  )
}
