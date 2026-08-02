import { ACHIEVEMENTS } from '../achievements.ts'
import { AGENTS, AGENT_SLUGS, type AgentSlug } from '../agents.ts'
import { challengeNumber, msUntilNextDay } from '../daily.ts'
import type { LevelId } from '../levels.ts'
import { formatTime, isWin } from '../share.ts'
import { plural } from '../stats.ts'
import type { DailyRecord, RunProgress } from '../storage'
import type { Stack } from '../types'
import { Icon } from '../ui/icons.tsx'
import { AgentAvatar, Button } from '../ui/kit.tsx'
import { OutcomeTile } from '../ui/outcome.tsx'
import { SetPicker } from './SetPicker.tsx'

interface Props {
  day: string
  played: DailyRecord | null
  streak: number
  bestEndless: number
  seriesLength: number
  resume: RunProgress | null
  hero: AgentSlug
  accent: string
  unlocked: string[]
  onHero: (slug: AgentSlug) => void
  onDaily: () => void
  onEndless: () => void
  onAch: () => void
  level: LevelId
  stacks: Stack[]
  counts: Map<Stack, number | null>
  setSize: number
  onLevel: (level: LevelId) => void
  onToggle: (stack: Stack) => void
  onSet: () => void
}

function untilTomorrow(): string {
  const ms = msUntilNextDay()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

/** Уголки рамки — как на приборной панели: дешёвый способ сказать «это пульт». */
function Corners() {
  const base = 'pointer-events-none absolute h-4 w-4 border-[#2f2f3a]'
  return (
    <>
      <span className={`${base} top-3 left-3 rounded-tl-md border-t-2 border-l-2`} />
      <span className={`${base} top-3 right-3 rounded-tr-md border-t-2 border-r-2`} />
      <span className={`${base} bottom-3 left-3 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${base} right-3 bottom-3 rounded-br-md border-r-2 border-b-2`} />
    </>
  )
}

export function Home({
  day,
  played,
  streak,
  bestEndless,
  seriesLength,
  resume,
  hero,
  accent,
  unlocked,
  onHero,
  onDaily,
  onEndless,
  onAch,
  level,
  stacks,
  counts,
  setSize,
  onLevel,
  onToggle,
  onSet,
}: Props) {
  const agent = AGENTS[hero]
  const step = (dir: number) =>
    onHero(AGENT_SLUGS[(AGENT_SLUGS.indexOf(hero) + dir + AGENT_SLUGS.length) % AGENT_SLUGS.length])

  return (
    <div className="screen-in mx-auto flex max-w-[1120px] flex-wrap items-start gap-[22px] px-[18px] pt-7">
      <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-[22px]">
        <div className="relative flex flex-wrap items-center gap-[26px] overflow-hidden rounded-[18px] border border-[#26262c] bg-[linear-gradient(150deg,#15151c_0%,#101014_55%,#0d0d11_100%)] p-[26px]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)',
              backgroundSize: '34px 34px',
              maskImage: 'radial-gradient(120% 90% at 80% 0%, #000 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(120% 90% at 80% 0%, #000 0%, transparent 70%)',
            }}
          />
          <Corners />

          <div className="min-w-[240px] flex-[1_1_280px]">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[.16em] uppercase text-[#4ade80]">
              <span
                className="inline-block h-[7px] w-[7px] rounded-full bg-[#4ade80]"
                style={{ animation: 'blink 1.4s steps(1) infinite' }}
              />
              проверка готова
            </div>

            <h1 className="font-display mt-2.5 text-[clamp(34px,6vw,52px)] leading-none font-bold tracking-[-.03em] text-[#f4f4f6]">
              Ревью
              <br />
              за ИИ
            </h1>

            <p className="mt-3.5 max-w-[380px] leading-[1.55] text-[#9a9aa4]">
              ИИ написала код. Он собирается, тесты зелёные.
              <br />
              <span className="text-[#e7e7ea]">Найди, где тебя обманули.</span>
            </p>

            <div className="mt-[18px] flex flex-wrap gap-2 font-mono text-[11px]">
              {['90 секунд', '2 попытки', 'без подсказок'].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#26262c] px-2.5 py-1 text-[#8b8b95]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="flex min-w-[160px] flex-[0_1_190px] flex-col gap-2">
            <AgentAvatar
              slug={agent.slug}
              name={agent.name}
              color={accent}
              size={190}
              className="mx-auto transition-[box-shadow,border-color] duration-300"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => step(-1)}
                title="Предыдущий агент"
                className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-[#2c2c34] bg-[#15151b] text-[#8b8b95] shadow-[0_3px_0_#0c0c10]"
              >
                <Icon name="chevron-left" size={16} />
              </button>
              <span
                className="text-center font-mono text-[11px] tracking-[.14em] uppercase"
                style={{ color: accent }}
              >
                {agent.name}
              </span>
              <button
                onClick={() => step(1)}
                title="Следующий агент"
                className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-[#2c2c34] bg-[#15151b] text-[#8b8b95] shadow-[0_3px_0_#0c0c10]"
              >
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
            <span className="text-center font-mono text-[10px] leading-[1.4] text-[#5c5c66]">
              {agent.lang}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          <div
            className="flex flex-col gap-3.5 rounded-2xl p-5"
            style={{
              border: `1px solid ${accent}44`,
              background: `linear-gradient(180deg, ${accent}14, #111116 70%)`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-[#f2f2f5]">
                <span style={{ color: accent }}>
                  <Icon name="calendar-check" size={16} />
                </span>
                Челлендж&nbsp;№{challengeNumber(day)}
              </span>
              <span className="font-mono text-[11px] text-[#6b6b77]">
                {seriesLength} {plural(seriesLength, 'раунд', 'раунда', 'раундов')}
              </span>
            </div>

            {played ? (
              <>
                <div className="flex min-h-[42px] flex-wrap items-center gap-2">
                  {played.outcomes.map((o, i) => (
                    <OutcomeTile key={i} outcome={o} size={28} delay={i * 70} />
                  ))}
                  <span className="ml-1 font-mono text-xs text-[#9a9aa4]">
                    {played.outcomes.filter(isWin).length}/{played.outcomes.length} ·{' '}
                    {played.score} {plural(played.score, 'очко', 'очка', 'очков')} ·{' '}
                    {formatTime(played.seconds)}
                  </span>
                </div>
                <p className="m-0 text-sm text-[#6b6b77]">
                  На сегодня всё. Следующий через {untilTomorrow()}.
                </p>
              </>
            ) : (
              <>
                <p className="m-0 min-h-[42px] text-sm leading-[1.5] text-[#9a9aa4]">
                  {resume
                    ? `Серия начата: сыграно ${resume.index + 1} из ${seriesLength}.`
                    : 'У всех сегодня одни и те же задачи. Один заход.'}
                </p>
                <Button accent={accent} onClick={onDaily}>
                  {resume ? 'Продолжить' : 'Начать проверку'}
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3.5 rounded-2xl border border-[#26262c] bg-[#111116] p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-[#f2f2f5]">
                <span className="text-[#8b8b95]">
                  <Icon name="infinity" size={16} />
                </span>
                Бесконечный
              </span>
              <span className="font-mono text-[11px] text-[#6b6b77]">
                {bestEndless > 0 ? `рекорд ${bestEndless}` : 'без рекорда'}
              </span>
            </div>
            <p className="m-0 min-h-[42px] text-sm leading-[1.5] text-[#9a9aa4]">
              Играешь, пока полоска здоровья не кончится. Три инцидента — отстранение.
            </p>
            <Button variant="secondary" accent={accent} onClick={onEndless}>
              Ночное дежурство
            </Button>
          </div>
        </div>

        {streak > 0 && (
          <div className="flex items-center gap-2 text-[13px] text-[#8b8b95]">
            <span
              className="text-[#fb923c]"
              style={{ animation: 'flameFlicker 1.6s ease-in-out infinite' }}
            >
              <Icon name="flame" size={15} />
            </span>
            {streak} {plural(streak, 'день', 'дня', 'дней')} подряд
          </div>
        )}

        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
          {ACHIEVEMENTS.map((a) => {
            const on = unlocked.includes(a.id)
            return (
              <span
                key={a.id}
                title={`${a.title} — ${a.desc}`}
                className="mb-[5px] flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px]"
                style={{
                  border: on ? `1.5px solid ${accent}77` : '1.5px solid #202027',
                  background: on
                    ? `radial-gradient(120% 130% at 50% 0%, ${accent}30, #14141a 72%)`
                    : 'repeating-linear-gradient(135deg,#101014 0 5px,#0c0c10 5px 10px)',
                  boxShadow: on
                    ? `inset 0 1px 0 rgba(255,255,255,.14), 0 4px 0 #0b0b0e, 0 0 20px ${accent}22`
                    : 'inset 0 1px 0 rgba(255,255,255,.03), 0 4px 0 #0a0a0d',
                  color: on ? accent : '#33333c',
                }}
              >
                <Icon name={on ? a.icon : 'lock'} size={19} />
              </span>
            )
          })}
          <button
            onClick={onAch}
            className="cursor-pointer font-mono text-[11px] whitespace-nowrap text-[#6b6b77] transition-colors"
            style={{ color: undefined }}
            onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = '')}
          >
            все ачивки →
          </button>
        </div>
      </div>

      <SetPicker
        level={level}
        stacks={stacks}
        counts={counts}
        setSize={setSize}
        accent={accent}
        onLevel={onLevel}
        onToggle={onToggle}
        onStart={onSet}
      />
    </div>
  )
}
