import { useCallback, useMemo, useRef, useState } from 'react'
import pack from './content/pack.json'
import type { Outcome, Task } from './types'
import { accuracy, roundDuration, roundScore } from './scoring.ts'
import {
  ENDLESS_LIVES,
  isRunOver,
  MAX_ATTEMPTS,
  resolveClaimClean,
  resolveLineClick,
  resolveTimeout,
  type PickResult,
} from './round.ts'
import { dayKey, pickDaily, pickEndless } from './daily.ts'
import {
  getBestEndless,
  getDaily,
  getStreak,
  isOnboarded,
  markOnboarded,
  saveDaily,
  saveEndless,
} from './storage.ts'
import { isWin } from './share.ts'
import { trackRound, trackSeries } from './analytics.ts'
import { Briefing } from './components/Briefing.tsx'
import { DiffView, type LineState } from './components/DiffView.tsx'
import { Hint } from './components/Hint.tsx'
import { Home } from './components/Home.tsx'
import { Summary, type Played } from './components/Summary.tsx'
import { Timer, useCountdown } from './components/Timer.tsx'
import { Verdict } from './components/Verdict.tsx'

const POOL = pack as Task[]

type Screen = 'home' | 'briefing' | 'review' | 'verdict' | 'summary'
type Mode = 'daily' | 'endless'

export default function App() {
  const today = useMemo(() => dayKey(), [])
  const dailySeries = useMemo(() => pickDaily(POOL, today), [today])

  const [screen, setScreen] = useState<Screen>('home')
  const [mode, setMode] = useState<Mode>('daily')
  const [index, setIndex] = useState(0)
  const [task, setTask] = useState<Task>(dailySeries[0])

  const [wrongPicks, setWrongPicks] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('missed')
  const [score, setScore] = useState(0)

  const [history, setHistory] = useState<Played[]>([])
  const [missed, setMissed] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [newRecord, setNewRecord] = useState(false)
  const [showHint, setShowHint] = useState(!isOnboarded())

  const endlessSeed = useRef('')

  const played = getDaily(today)
  const streak = getStreak(today)
  const duration = roundDuration(missed)

  const runOver = isRunOver(mode, index, dailySeries.length, missed)

  const finish = useCallback(
    (result: Outcome, secondsLeft: number, attempt: number, line: number | null) => {
      const acc =
        result === 'found' ? accuracy(attempt, true) : result === 'clean-correct' ? 1 : 0
      const points = roundScore(task.difficulty, secondsLeft, acc)

      setPicked(line)
      setOutcome(result)
      setScore(points)
      setSeconds((s) => s + (duration - secondsLeft))
      setHistory((h) => [...h, { task, outcome: result, score: points }])
      if (!isWin(result)) setMissed((m) => m + 1)
      setScreen('verdict')

      trackRound({
        task: task.id,
        outcome: result,
        seconds: duration - secondsLeft,
        attempt,
        mode,
        difficulty: task.difficulty,
      })
    },
    [task, duration, mode],
  )

  const apply = useCallback(
    (result: PickResult, secondsLeft: number) => {
      if (result.kind === 'continue') {
        setWrongPicks(result.wrongPicks)
        return
      }
      finish(result.outcome, secondsLeft, result.attempt, result.line)
    },
    [finish],
  )

  const left = useCountdown(
    screen === 'review',
    duration,
    useCallback(() => apply(resolveTimeout(), 0), [apply]),
  )

  const marks = useMemo(() => {
    const m = new Map<number, LineState>()
    for (const line of wrongPicks) m.set(line, 'wrong')
    return m
  }, [wrongPicks])

  function startDaily() {
    setMode('daily')
    setIndex(0)
    setTask(dailySeries[0])
    resetRun()
    setScreen('briefing')
  }

  function startEndless() {
    endlessSeed.current = `${today}:${performance.now()}`
    setMode('endless')
    setIndex(0)
    setTask(pickEndless(POOL, endlessSeed.current, 0))
    resetRun()
    setScreen('briefing')
  }

  function resetRun() {
    setWrongPicks([])
    setPicked(null)
    setHistory([])
    setMissed(0)
    setSeconds(0)
    setNewRecord(false)
  }

  function pickLine(line: number) {
    if (screen !== 'review') return
    apply(resolveLineClick(task, line, wrongPicks), left)
  }

  function claimClean() {
    if (screen !== 'review') return
    apply(resolveClaimClean(task, wrongPicks), left)
  }

  function endRun() {
    if (mode === 'daily') {
      saveDaily(today, {
        outcomes: history.map((h) => h.outcome),
        score: history.reduce((s, h) => s + h.score, 0),
        seconds,
      })
    } else {
      setNewRecord(saveEndless(history.reduce((s, h) => s + h.score, 0)))
    }
    setScreen('summary')

    trackSeries({
      mode,
      rounds: history.length,
      wins: history.filter((h) => isWin(h.outcome)).length,
      seconds,
    })
  }

  function next() {
    if (runOver) {
      endRun()
      return
    }

    const i = index + 1
    setIndex(i)
    setTask(
      mode === 'daily'
        ? dailySeries[i]
        : // Последние пять задач забега — чтобы на маленьком пуле
          // не показать одно и то же дважды подряд.
          pickEndless(POOL, endlessSeed.current, i, history.slice(-5).map((h) => h.task.id)),
    )
    setWrongPicks([])
    setPicked(null)
    setScreen('briefing')
  }

  const runningTotal = history.reduce((s, r) => s + r.score, 0)

  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6">
      {screen !== 'home' && (
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-800 pb-4 sm:mb-8">
          <button
            onClick={() => setScreen('home')}
            className="text-sm font-medium tracking-tight text-zinc-400 transition hover:text-zinc-100"
          >
            ← Ревью за ИИ
          </button>
          <span className="font-mono text-xs text-zinc-500">
            {mode === 'daily'
              ? `раунд ${index + 1}/${dailySeries.length}`
              : `раунд ${index + 1} · жизней ${ENDLESS_LIVES - missed}`}{' '}
            · {runningTotal} очков
          </span>
        </header>
      )}

      {screen === 'home' && (
        <Home
          day={today}
          played={played}
          streak={streak}
          bestEndless={getBestEndless()}
          seriesLength={dailySeries.length}
          onDaily={startDaily}
          onEndless={startEndless}
        />
      )}

      {screen === 'briefing' && <Briefing task={task} onStart={() => setScreen('review')} />}

      {screen === 'review' && (
        <div className="space-y-5">
          <Timer left={left} duration={duration} />

          {showHint && (
            <Hint
              onClose={() => {
                markOnboarded()
                setShowHint(false)
              }}
            />
          )}

          <p className="text-sm text-zinc-400">
            Кликни строку, в которой подлянка.{' '}
            {wrongPicks.length > 0 && (
              <span className="text-red-400">
                Осталось попыток: {MAX_ATTEMPTS - wrongPicks.length}
              </span>
            )}
          </p>

          <DiffView diff={task.diff} tokens={task.tokens} marks={marks} onPick={pickLine} />

          <button
            onClick={claimClean}
            className="w-full rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Здесь чисто
          </button>
        </div>
      )}

      {screen === 'verdict' && (
        <Verdict
          task={task}
          outcome={outcome}
          score={score}
          picked={picked}
          onNext={next}
          hasNext={!runOver}
        />
      )}

      {screen === 'summary' && (
        <Summary
          mode={mode}
          day={today}
          history={history}
          seconds={seconds}
          newRecord={newRecord}
          onHome={() => setScreen('home')}
        />
      )}
    </div>
  )
}
