import { useCallback, useMemo, useState } from 'react'
import pack from './content/pack.json'
import type { Task } from './types'
import { accuracy, isCorrectLine, roundScore, ROUND_SECONDS } from './scoring'
import { Briefing } from './components/Briefing'
import { DiffView, type LineState } from './components/DiffView'
import { Timer, useCountdown } from './components/Timer'
import { Verdict, type Outcome } from './components/Verdict'

const TASKS = pack as Task[]
const MAX_ATTEMPTS = 2

type Phase = 'briefing' | 'review' | 'verdict' | 'summary'

interface Done {
  task: Task
  outcome: Outcome
  score: number
}

export default function App() {
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('briefing')
  const [wrongPicks, setWrongPicks] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('missed')
  const [score, setScore] = useState(0)
  const [history, setHistory] = useState<Done[]>([])

  const task = TASKS[current]
  const hasNext = current < TASKS.length - 1

  const finish = useCallback(
    (result: Outcome, secondsLeft: number, attempt: number, line: number | null) => {
      const acc =
        result === 'found' ? accuracy(attempt, true) : result === 'clean-correct' ? 1 : 0
      const points = roundScore(task.difficulty, secondsLeft, acc)

      setPicked(line)
      setOutcome(result)
      setScore(points)
      setHistory((h) => [...h, { task, outcome: result, score: points }])
      setPhase('verdict')
    },
    [task],
  )

  const { left } = useCountdown(
    phase === 'review',
    useCallback(() => finish('missed', 0, MAX_ATTEMPTS + 1, null), [finish]),
  )

  const marks = useMemo(() => {
    const m = new Map<number, LineState>()
    for (const line of wrongPicks) m.set(line, 'wrong')
    return m
  }, [wrongPicks])

  function pickLine(line: number) {
    if (phase !== 'review') return

    // На чистом раунде любой клик по строке — это обвинение. Второй попытки нет.
    if (task.clean) {
      finish('false-accusation', left, 1, line)
      return
    }

    if (isCorrectLine(task, line)) {
      finish('found', left, wrongPicks.length + 1, line)
      return
    }

    const next = [...wrongPicks, line]
    setWrongPicks(next)
    if (next.length >= MAX_ATTEMPTS) finish('missed', left, MAX_ATTEMPTS + 1, line)
  }

  function claimClean() {
    if (phase !== 'review') return
    if (task.clean) finish('clean-correct', left, wrongPicks.length + 1, null)
    else finish('missed', left, MAX_ATTEMPTS + 1, null)
  }

  function next() {
    if (!hasNext) {
      setPhase('summary')
      return
    }
    setCurrent((i) => i + 1)
    setWrongPicks([])
    setPicked(null)
    setPhase('briefing')
  }

  function restart() {
    setCurrent(0)
    setWrongPicks([])
    setPicked(null)
    setHistory([])
    setPhase('briefing')
  }

  const total = history.reduce((s, r) => s + r.score, 0)

  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-baseline justify-between border-b border-zinc-800 pb-4">
        <span className="text-sm font-medium tracking-tight text-zinc-300">Ревью за ИИ</span>
        <span className="font-mono text-xs text-zinc-500">
          раунд {Math.min(current + 1, TASKS.length)}/{TASKS.length} · {total} очков
        </span>
      </header>

      {phase === 'briefing' && <Briefing task={task} onStart={() => setPhase('review')} />}

      {phase === 'review' && (
        <div className="space-y-5">
          <Timer left={left} />

          <p className="text-sm text-zinc-400">
            Кликни строку, в которой подлянка.{' '}
            {wrongPicks.length > 0 && (
              <span className="text-red-400">
                Осталось попыток: {MAX_ATTEMPTS - wrongPicks.length}
              </span>
            )}
          </p>

          <DiffView diff={task.diff} marks={marks} onPick={pickLine} />

          <button
            onClick={claimClean}
            className="w-full rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Здесь чисто
          </button>
        </div>
      )}

      {phase === 'verdict' && (
        <Verdict
          task={task}
          outcome={outcome}
          score={score}
          picked={picked}
          onNext={next}
          hasNext={hasNext}
        />
      )}

      {phase === 'summary' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-100">Смена окончена</h2>
            <p className="mt-1 text-zinc-400">
              {total} очков за {history.length} раундов
            </p>
          </div>

          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {history.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-zinc-300">{r.task.title}</span>
                <span className="font-mono text-sm tabular-nums text-zinc-500">
                  {r.outcome === 'found' || r.outcome === 'clean-correct' ? '🟩' : '🟥'} {r.score}
                </span>
              </li>
            ))}
          </ul>

          <button
            onClick={restart}
            className="w-full rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
          >
            Ещё раз
          </button>
        </div>
      )}

      <footer className="mt-12 border-t border-zinc-800 pt-4 text-xs text-zinc-600">
        M0 — прототип. Раунд {ROUND_SECONDS} с, две попытки.
      </footer>
    </div>
  )
}
