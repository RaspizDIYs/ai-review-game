import { challengeNumber, msUntilNextDay } from '../daily.ts'
import { formatTime, isWin } from '../share.ts'
import type { DailyRecord } from '../storage'

interface Props {
  day: string
  played: DailyRecord | null
  streak: number
  bestEndless: number
  seriesLength: number
  onDaily: () => void
  onEndless: () => void
}

function untilTomorrow(): string {
  const h = Math.floor(msUntilNextDay() / 3_600_000)
  const m = Math.floor((msUntilNextDay() % 3_600_000) / 60_000)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

export function Home({
  day,
  played,
  streak,
  bestEndless,
  seriesLength,
  onDaily,
  onEndless,
}: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Ревью за ИИ</h1>
        <p className="mt-2 text-zinc-400">
          ИИ написала код. Он собирается, тесты зелёные.
          <br />
          Найди, где тебя обманули.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-zinc-200">Челлендж #{challengeNumber(day)}</span>
          <span className="text-xs text-zinc-500">{seriesLength} раундов</span>
        </div>

        {played ? (
          <>
            <p className="mt-3 font-mono text-lg">
              {played.outcomes.map((o, i) => (
                <span key={i}>{isWin(o) ? '🟩' : o === 'missed' ? '🟥' : '⬜'}</span>
              ))}
              <span className="ml-3 text-sm text-zinc-400">
                {played.outcomes.filter(isWin).length}/{played.outcomes.length} ·{' '}
                {played.score} очков · {formatTime(played.seconds)}
              </span>
            </p>
            <p className="mt-3 text-sm text-zinc-500">
              На сегодня всё. Следующий через {untilTomorrow()}.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              У всех сегодня одни и те же задачи. Один заход.
            </p>
            <button
              onClick={onDaily}
              className="mt-4 w-full rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
            >
              Играть
            </button>
          </>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-zinc-200">Бесконечный</span>
          <span className="text-xs text-zinc-500">
            {bestEndless > 0 ? `рекорд ${bestEndless}` : 'без рекорда'}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Играешь, пока не пропустишь три подлянки.
        </p>
        <button
          onClick={onEndless}
          className="mt-4 w-full rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
        >
          Начать смену
        </button>
      </div>

      {streak > 0 && (
        <p className="text-center text-sm text-zinc-500">
          {streak} {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} подряд
        </p>
      )}
    </div>
  )
}
