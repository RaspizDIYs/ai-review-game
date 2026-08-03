/**
 * Выбор хода. Единственный экран смены, где игра ничего не спрашивает про код.
 *
 * Ход один, а дел два: смотреть новый PR или разгребать то, что уже лежит
 * в проде. Уборка не даёт очков и не радует команду — она просто убирает
 * одну мину. В этом и выбор: заплатить ходом сейчас или получить алерт потом.
 *
 * Экран сознательно короткий. Он повторяется четырнадцать раз за смену,
 * и любая лишняя строка на нём будет прочитана один раз, а промотана
 * тринадцать.
 */

import type { PullRequest } from '../pr.ts'
import { CLEANUP_HEAL, MAX_HEALTH } from '../prod.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Button, Kicker } from '../ui/kit.tsx'

interface Props {
  turn: number
  turns: number
  pr: PullRequest
  task: Task
  agentName: string
  health: number
  accent: string
  onReview: () => void
  onCleanup: () => void
}

export function TurnPick({
  turn,
  turns,
  pr,
  task,
  agentName,
  health,
  accent,
  onReview,
  onCleanup,
}: Props) {
  // Здоровье дробное из-за утечки — в интерфейсе округляем, иначе игрок
  // читает «+0.9000000000000057».
  const heal = Math.round(Math.min(CLEANUP_HEAL, MAX_HEALTH - health) * 10) / 10

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display m-0 text-[clamp(20px,3.6vw,27px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
          Ход {turn + 1} из {turns}
        </h1>
        <span className="font-mono text-[11px] text-[#6b6b77]">
          ход тратится в любом случае
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <div
          className="flex flex-col gap-3.5 rounded-2xl p-5"
          style={{
            border: `1px solid ${accent}44`,
            background: `linear-gradient(180deg, ${accent}14, #111116 70%)`,
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: accent }}>
              <Icon name="git-pull-request" size={16} />
            </span>
            <span className="font-semibold text-[#f2f2f5]">Новый пул-реквест</span>
            <span className="flex-1" />
            <span className="font-mono text-[11px] text-[#6b6b77]">#{pr.number}</span>
          </div>

          <div className="min-h-[62px]">
            <p className="m-0 font-mono text-[13px] leading-[1.5] text-[#d8d8dd]">{pr.title}</p>
            <Kicker className="mt-2">
              {agentName} · {task.stack} · сложность {task.difficulty}
            </Kicker>
          </div>

          <Button accent={accent} onClick={onReview} autoFocus>
            Смотреть
          </Button>
        </div>

        <div className="flex flex-col gap-3.5 rounded-2xl border border-[#26262c] bg-[#111116] p-5">
          <div className="flex items-center gap-2">
            <span className="text-[#8b8b95]">
              <Icon name="sparkles" size={16} />
            </span>
            <span className="font-semibold text-[#f2f2f5]">Разгрести долг</span>
          </div>

          {/* Ни числа мин, ни имени той, которую уберём: смена слепая, и этот
              экран не должен подсказывать, сколько ошибок игрок уже сделал. */}
          <div className="min-h-[62px]">
            <p className="m-0 text-sm leading-[1.5] text-[#9a9aa4]">
              Профилактика вместо ревью. Если в проде что-то лежит, уборка
              разберёт самое лёгкое — что именно, ты не узнаешь.
            </p>
            <Kicker className="mt-2">
              {heal > 0 ? `+${heal} здоровья` : 'здоровье и так полное'}
            </Kicker>
          </div>

          <Button variant="secondary" accent={accent} onClick={onCleanup}>
            Разгрести долг
          </Button>
        </div>
      </div>
    </div>
  )
}
