import type { ProdState } from '../defects.ts'
import type { Track } from '../music.ts'
import type { PullRequest } from '../pr.ts'
import { plural } from '../stats.ts'
import type { Outcome } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Gauges } from './Gauges.tsx'
import { RepoName } from './RepoName.tsx'
import { Volume } from './Volume.tsx'

interface Props {
  accent: string
  /** Имя репозитория, как его ввёл игрок. Правится тут же, в шапке. */
  repo: string
  onRepo: (repo: string) => void
  /** Пул-реквест текущего раунда. Вне забега его нет: смотреть нечего. */
  pr: PullRequest | null
  achCount: number
  achTotal: number
  audio: {
    sound: boolean
    music: number
    musicOn: boolean
    track: Track | null
    onSound: () => void
    onMusic: (volume: number) => void
    onMusicToggle: () => void
    onNext: () => void
    onMute: (muted: boolean) => void
  }
  onAch: () => void
  /** Шапка забега показывается только внутри раунда. */
  run: {
    /** По одному на сыгранный ход. `cleanup` — ход ушёл на уборку. */
    outcomes: (Outcome | 'cleanup')[]
    index: number
    length: number
    total: number
    endless: boolean
    lives: number
    maxLives: number
    /** Шкалы прода — только в смене. */
    prod: { health: number; velocity: number; delta: number; state: ProdState } | null
    onExit: () => void
  } | null
}

const PIP_COLOR: Record<Outcome | 'cleanup', string> = {
  found: '#34d399',
  'clean-correct': '#34d399',
  missed: '#f87171',
  partial: '#fbbf24',
  'false-accusation': '#fbbf24',
  cleanup: '#7c9cf5',
}

export function Chrome({
  accent,
  repo,
  onRepo,
  pr,
  achCount,
  achTotal,
  audio,
  onAch,
  run,
}: Props) {
  return (
    <div className="sticky top-0 z-40 border-b border-[#1f1f26] bg-[#0a0a0ce8] backdrop-blur-[10px]">
      <div className="mx-auto flex max-w-[900px] items-center gap-3 px-[18px] py-2.5">
        <span style={{ color: accent }}>
          <Icon name="git-pull-request" size={16} />
        </span>
        <RepoName value={repo} accent={accent} onChange={onRepo} />

        {pr ? (
          <>
            {/* Заголовок PR — не украшение: он собран из того, что попросили
                у ИИ, и первым говорит, что вообще приехало на ревью. */}
            <span className="hidden min-w-0 truncate font-mono text-xs text-[#8b8b95] sm:inline">
              {pr.title}
            </span>
            <span className="rounded-full border border-[#26262c] px-2 py-px font-mono text-[11px] whitespace-nowrap text-[#6b6b77]">
              #{pr.number}
            </span>
          </>
        ) : (
          <span className="truncate font-mono text-[11px] text-[#5c5c66]">
            ревью за ии
          </span>
        )}

        <span className="flex-1" />

        <button
          onClick={onAch}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#26262c] bg-[#121216] px-2.5 py-1.5 font-mono text-[11px] text-[#a1a1ab] transition-colors hover:border-[#3a3a44] hover:text-[#e7e7ea]"
        >
          <Icon name="award" size={14} />
          {achCount}/{achTotal}
        </button>

        <Volume accent={accent} {...audio} />
      </div>

      {run && (
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-x-3.5 gap-y-2 px-[18px] pb-2.5">
          <button
            onClick={run.onExit}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-[#6b6b77] transition-colors hover:text-[#e7e7ea]"
          >
            <Icon name="arrow-left" size={13} />
            выйти
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: run.length }, (_, i) => {
              const outcome = run.outcomes[i]
              const done = outcome ? PIP_COLOR[outcome] : '#2a2a32'
              const now = i === run.index
              return (
                <span
                  key={i}
                  className="inline-block h-[7px] rounded-full transition-all duration-300"
                  style={{ width: now ? 18 : 7, background: now ? accent : done }}
                />
              )
            })}
          </div>

          {run.endless && (
            <div className="flex items-center gap-[7px]">
              <span className="text-[#f87171]">
                <Icon name="heart-pulse" size={13} />
              </span>
              <span className="inline-block h-1.5 w-[88px] overflow-hidden rounded-full bg-[#26262c]">
                <span
                  className="block h-full transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{
                    width: `${Math.max(0, run.lives / run.maxLives) * 100}%`,
                    background: run.lives <= 1 ? '#f87171' : '#fb923c',
                  }}
                />
              </span>
            </div>
          )}

          {run.prod && (
            <Gauges
              health={run.prod.health}
              velocity={run.prod.velocity}
              delta={run.prod.delta}
              state={run.prod.state}
              accent={accent}
              compact
            />
          )}

          <span className="flex-1" />

          <span className="font-mono text-xs text-[#8b8b95]">
            <span className="font-bold text-[#e7e7ea] tabular-nums">{run.total}</span>{' '}
            {plural(run.total, 'очко', 'очка', 'очков')}
          </span>
        </div>
      )}
    </div>
  )
}
