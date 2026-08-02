import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import pack from './content/pack.json'
import reasons from './content/reasons.json'
import type { Outcome, Stack, Task } from './types'
import { accuracy, roundDuration, roundScore } from './scoring.ts'
import {
  ENDLESS_LIVES,
  isRunOver,
  resolveSubmit,
  resolveTimeout,
  type Coverage,
  type SubmitResult,
} from './round.ts'
import { dayKey, pickDaily, pickEndless } from './daily.ts'
import { availability, pickSet, type LevelId } from './levels.ts'
import { STACKS } from './stacks.ts'
import {
  getBestEndless,
  getDaily,
  getProfile,
  getProgress,
  getSettings,
  getStreak,
  isOnboarded,
  markOnboarded,
  saveDaily,
  saveEndless,
  saveProfile,
  saveProgress,
  saveSettings,
  type Profile,
  type Settings,
} from './storage.ts'
import { isWin } from './share.ts'
import { trackRound, trackSeries } from './analytics.ts'
import { loadStats, type Stats } from './stats.ts'
import { loadTokens } from './tokens.ts'
import { reasonOptions, WRONG_REASON_FACTOR, type ReasonOption } from './reason.ts'
import { AGENTS, agentFor, briefLine, type AgentSlug } from './agents.ts'
import { ACHIEVEMENTS, achievement, roundUnlocks, runUnlocks } from './achievements.ts'
import { beep, setSoundEnabled } from './sound.ts'
import { useCountdown } from './countdown.ts'
import { Achievements } from './components/Achievements.tsx'
import { Briefing } from './components/Briefing.tsx'
import { Chrome } from './components/Chrome.tsx'
import type { LineState } from './components/DiffView.tsx'
import { Home } from './components/Home.tsx'
import { Reason } from './components/Reason.tsx'
import { Review } from './components/Review.tsx'
import { Rules } from './components/Rules.tsx'
import { Summary, type Played } from './components/Summary.tsx'
import { Toast } from './components/Toast.tsx'
import { Verdict } from './components/Verdict.tsx'

const POOL = pack as Task[]
const REASONS = reasons as Record<string, string>

type Screen =
  | 'home'
  | 'rules'
  | 'briefing'
  | 'review'
  | 'reason'
  | 'verdict'
  | 'summary'
  | 'ach'
type Mode = 'daily' | 'endless' | 'set'

/** Языки, по которым в паке вообще что-то есть, — на них и настраивается подборка. */
const PLAYABLE = STACKS.filter((s) => POOL.some((t) => t.stack === s))
const DEFAULT_SETTINGS: Settings = { level: 'junior', stacks: PLAYABLE, played: 0 }

/** Номер «пул-реквеста» в шапке: чистое украшение, но оно держит метафору. */
const PR_BASE = 1408

interface Pending {
  outcome: Outcome
  secondsLeft: number
  attempt: number
  picks: number[]
  coverage: Coverage | null
}

export default function App() {
  const today = useMemo(() => dayKey(), [])
  const dailySeries = useMemo(() => pickDaily(POOL, today), [today])

  const [screen, setScreen] = useState<Screen>('home')
  const [prevScreen, setPrevScreen] = useState<Screen>('home')
  const [mode, setMode] = useState<Mode>('daily')
  const [index, setIndex] = useState(0)
  const [task, setTask] = useState<Task>(dailySeries[0])
  const [series, setSeries] = useState<Task[]>(dailySeries)

  const [settings, setSettings] = useState<Settings>(() => getSettings(DEFAULT_SETTINGS))
  const [profile, setProfile] = useState<Profile>(() => getProfile())

  const setSeed = `${settings.level}:${settings.stacks.join(',')}:${settings.played}`
  // В списке языков — сколько задач по каждому доступно на выбранном уровне,
  // а не как разложится ближайшая тройка: игроку важен размер пула.
  const counts = useMemo(() => availability(POOL, settings.level, STACKS), [settings.level])
  const setSize = useMemo(
    () => pickSet(POOL, settings.level, settings.stacks, setSeed).length,
    [settings.level, settings.stacks, setSeed],
  )

  // Выбор строк: отмечаем сколько нужно и отправляем разом.
  const [selected, setSelected] = useState<number[]>([])
  const [wrongPicks, setWrongPicks] = useState<number[]>([])
  const [attempts, setAttempts] = useState(0)
  const [shake, setShake] = useState(false)

  const [picks, setPicks] = useState<number[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('missed')
  const [score, setScore] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const [pending, setPending] = useState<Pending | null>(null)
  const [chosenReason, setChosenReason] = useState<ReasonOption | null>(null)

  const [history, setHistory] = useState<Played[]>([])
  /** Пропущенные подлянки: от них усталость и жизни. Обвинения сюда не идут. */
  const [missed, setMissed] = useState(0)
  const [foundStreak, setFoundStreak] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [newRecord, setNewRecord] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /**
   * Первый запуск: правила показываются один раз перед самой первой игрой,
   * а не поверх дифа — там уже идёт таймер, и читать инструкцию поздно.
   * Начатый режим ждёт здесь, пока игрок не дочитает.
   */
  const [pendingStart, setPendingStart] = useState<(() => void) | null>(null)

  const [tokens, setTokens] = useState<Task['tokens']>(undefined)
  useEffect(() => {
    let actual = true
    setTokens(undefined)
    loadTokens(task.id).then((t) => {
      if (actual) setTokens(t)
    })
    return () => {
      actual = false
    }
  }, [task.id])

  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    loadStats().then(setStats)
  }, [])

  useEffect(() => setSoundEnabled(profile.sound), [profile.sound])

  const endlessSeed = useRef('')
  const played = getDaily(today)
  const streak = getStreak(today)
  const duration = roundDuration(missed)
  const runOver = isRunOver(mode, index, series.length, missed)

  const agent = agentFor(task.stack)
  const hero = AGENTS[profile.hero as AgentSlug] ?? AGENTS.commander
  // Внутри раунда интерфейс красится под агента задачи, снаружи — под выбранного.
  const inRun = screen === 'briefing' || screen === 'review' || screen === 'reason' || screen === 'verdict'
  const accent = inRun ? agent.color : hero.color

  const options = useMemo(() => reasonOptions(task, POOL, REASONS), [task])

  function keep(next: Profile) {
    setProfile(next)
    saveProfile(next)
  }

  function unlock(ids: string[], base: Profile) {
    const fresh = ids.filter((id) => !base.unlocked.includes(id))
    if (fresh.length === 0) {
      keep(base)
      return
    }

    keep({ ...base, unlocked: [...base.unlocked, ...fresh] })
    setTimeout(() => {
      setToast(fresh[0])
      setTimeout(() => setToast(null), 3200)
    }, 700)
  }

  const finish = useCallback(
    (result: Pending, reasonRight: boolean | null) => {
      const base = accuracy(result.outcome, result.attempt, result.coverage)
      // Строку нашёл, но не понял чем она плоха — раунд выигран наполовину.
      const acc = reasonRight === false ? base * WRONG_REASON_FACTOR : base
      const points = roundScore(task.difficulty, result.secondsLeft, acc, duration)

      const win = isWin(result.outcome)
      const spent = duration - result.secondsLeft
      const nextHistory = [...history, { task, outcome: result.outcome, score: points }]
      // Усталость и жизни — только за уехавшее в прод. Частичный ответ и
      // заблокированный зря мёрдж стоят очков, но ночного инцидента после них нет.
      const nextMissed = missed + (result.outcome === 'missed' ? 1 : 0)
      const nextSeconds = seconds + spent
      const nextStreak = win ? foundStreak + 1 : 0
      const lifetime = profile.lifetime + points

      setOutcome(result.outcome)
      setScore(points)
      setPicks(result.picks)
      setCoverage(result.coverage)
      setSecondsLeft(result.secondsLeft)
      setHistory(nextHistory)
      setMissed(nextMissed)
      setSeconds(nextSeconds)
      setFoundStreak(nextStreak)
      setScreen('verdict')

      beep(win || result.outcome === 'partial' ? 'ok' : 'bad')
      setTimeout(() => beep('stamp'), 180)

      unlock(
        roundUnlocks({
          task,
          outcome: result.outcome,
          spent,
          foundStreak: nextStreak,
          lifetime,
        }),
        { ...profile, lifetime },
      )

      // Пишем сразу, а не в конце серии: упавшая вкладка не должна съедать
      // единственный за день заход — и не должна давать начать его заново.
      if (mode === 'daily') {
        saveProgress({
          day: today,
          index,
          taskIds: nextHistory.map((h) => h.task.id),
          outcomes: nextHistory.map((h) => h.outcome),
          scores: nextHistory.map((h) => h.score),
          missed: nextMissed,
          seconds: nextSeconds,
        })
      }

      trackRound({
        task: task.id,
        outcome: result.outcome,
        seconds: spent,
        attempt: result.attempt,
        mode,
        difficulty: task.difficulty,
        reason: reasonRight,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task, duration, mode, history, missed, seconds, index, today, profile, foundStreak],
  )

  const apply = useCallback(
    (result: SubmitResult) => {
      if (result.kind === 'retry') {
        beep('bad')
        setWrongPicks((w) => [...w, ...result.wrongPicks])
        setSelected([])
        setAttempts(result.attempts)
        setShake(true)
        setTimeout(() => setShake(false), 420)
        return
      }

      const next: Pending = {
        outcome: result.outcome,
        secondsLeft: 0,
        attempt: result.attempt,
        picks: result.picks,
        coverage: result.coverage,
      }
      return next
    },
    [],
  )

  const left = useCountdown(
    screen === 'review',
    duration,
    useCallback(() => {
      const result = resolveTimeout()
      if (result.kind === 'finish') {
        finish(
          {
            outcome: result.outcome,
            secondsLeft: 0,
            attempt: result.attempt,
            picks: result.picks,
            coverage: result.coverage,
          },
          null,
        )
      }
    }, [finish]),
  )

  const marks = useMemo(() => {
    const m = new Map<number, LineState>()
    for (const line of wrongPicks) m.set(line, 'wrong')
    for (const line of selected) m.set(line, 'picked')
    return m
  }, [wrongPicks, selected])

  function pickLine(line: number) {
    if (screen !== 'review') return
    beep(selected.includes(line) ? 'deselect' : 'select')
    setSelected((s) => (s.includes(line) ? s.filter((l) => l !== line) : [...s, line]))
  }

  function submit() {
    if (screen !== 'review') return

    const result = resolveSubmit(task, selected, attempts)
    const next = apply(result)
    if (!next) return

    const done: Pending = { ...next, secondsLeft: left }

    // Нашёл строку — спрашиваем, чем она плоха. Время в этот момент уже
    // остановлено: шаг «почему» проверяет понимание, а не скорость чтения.
    if ((done.outcome === 'found' || done.outcome === 'partial') && options.length > 0) {
      setPending(done)
      setScreen('reason')
      return
    }

    finish(done, null)
  }

  function answerReason(option: ReasonOption) {
    if (!pending) return
    beep(option.right ? 'ok' : 'bad')
    setChosenReason(option)
    finish(pending, option.right)
    setPending(null)
  }

  function resetRound() {
    setSelected([])
    setWrongPicks([])
    setAttempts(0)
    setPicks([])
    setCoverage(null)
    setPending(null)
    setChosenReason(null)
  }

  /** Первая игра в жизни начинается с правил, дальше — сразу с брифинга. */
  function withRules(start: () => void) {
    if (isOnboarded()) {
      start()
      return
    }
    beep('tap')
    setPendingStart(() => start)
    setScreen('rules')
  }

  function resetRun() {
    resetRound()
    setHistory([])
    setMissed(0)
    setFoundStreak(0)
    setSeconds(0)
    setNewRecord(false)
  }

  /**
   * Начать или продолжить дневную серию. Незаконченный заход восстанавливается
   * целиком: раунды, усталость и потраченное время — иначе обновление страницы
   * работало бы как способ переиграть день.
   */
  function startDaily() {
    beep('start')
    setMode('daily')
    setSeries(dailySeries)
    resetRun()

    const saved = getProgress(today)
    if (!saved) {
      setIndex(0)
      setTask(dailySeries[0])
      setScreen('briefing')
      return
    }

    const restored: Played[] = saved.taskIds.map((id, i) => ({
      task: POOL.find((t) => t.id === id) ?? dailySeries[i],
      outcome: saved.outcomes[i],
      score: saved.scores[i],
    }))

    setHistory(restored)
    setMissed(saved.missed)
    setSeconds(saved.seconds)

    // Серия была доиграна, но итог не сохранился — закрыли вкладку на вердикте
    // последнего раунда. Досчитываем итог, а не отдаём раунд заново.
    if (saved.index >= dailySeries.length - 1) {
      endRun('daily', restored, saved.seconds)
      return
    }

    const i = saved.index + 1
    setIndex(i)
    setTask(dailySeries[i])
    setScreen('briefing')
  }

  /** Своя подборка: уровень режет сложность, языки — пул. */
  function startSet() {
    const set = pickSet(POOL, settings.level, settings.stacks, setSeed)
    if (set.length === 0) return

    beep('start')
    setMode('set')
    setSeries(set)
    setIndex(0)
    setTask(set[0])
    resetRun()
    setScreen('briefing')
  }

  function startEndless() {
    beep('start')
    endlessSeed.current = `${today}:${performance.now()}`
    setMode('endless')
    setSeries([])
    setIndex(0)
    setTask(pickEndless(POOL, endlessSeed.current, 0))
    resetRun()
    setScreen('briefing')
  }

  function changeSettings(next: Settings) {
    setSettings(next)
    saveSettings(next)
  }

  /** Значения передаются явно: при восстановлении серии состояние ещё не обновилось. */
  function endRun(runMode: Mode = mode, rounds: Played[] = history, total: number = seconds) {
    if (runMode === 'daily') {
      saveDaily(today, {
        outcomes: rounds.map((h) => h.outcome),
        score: rounds.reduce((s, h) => s + h.score, 0),
        seconds: total,
      })
    } else if (runMode === 'endless') {
      setNewRecord(saveEndless(rounds.reduce((s, h) => s + h.score, 0)))
    } else {
      // Счётчик сыгранных подборок входит в сид: следующая будет другой.
      changeSettings({ ...settings, played: settings.played + 1 })
    }

    beep('win')
    unlock(runUnlocks(runMode, rounds.map((h) => h.outcome)), profile)
    setScreen('summary')

    trackSeries({
      mode: runMode,
      rounds: rounds.length,
      wins: rounds.filter((h) => isWin(h.outcome)).length,
      seconds: total,
    })
  }

  function next() {
    beep('tap')
    if (runOver) {
      endRun()
      return
    }

    const i = index + 1
    setIndex(i)
    setTask(
      mode === 'endless'
        ? // Последние пять задач забега — чтобы на маленьком пуле
          // не показать одно и то же дважды подряд.
          pickEndless(POOL, endlessSeed.current, i, history.slice(-5).map((h) => h.task.id))
        : series[i],
    )
    resetRound()
    setScreen('briefing')
  }

  function goHome() {
    beep('tap')
    resetRun()
    setScreen('home')
  }

  const runningTotal = history.reduce((s, r) => s + r.score, 0)
  const toastAchievement = toast ? achievement(toast) : undefined

  return (
    <div
      className="relative min-h-full pb-16"
      style={{
        backgroundColor: '#0a0a0c',
        backgroundImage:
          'radial-gradient(900px 480px at 50% -8%, #1a1a24 0%, rgba(10,10,12,0) 62%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(6,6,8,.55) 100%)',
        }}
      />

      <Chrome
        accent={accent}
        prNumber={PR_BASE + index}
        achCount={profile.unlocked.length}
        achTotal={ACHIEVEMENTS.length}
        sound={profile.sound}
        onSound={() => {
          const on = !profile.sound
          setSoundEnabled(on)
          keep({ ...profile, sound: on })
          if (on) setTimeout(() => beep('toggle'), 30)
        }}
        onAch={() => {
          beep('tap')
          setPrevScreen(screen)
          setScreen('ach')
        }}
        run={
          inRun
            ? {
                outcomes: history.map((h) => h.outcome),
                index,
                length: mode === 'endless' ? Math.max(index + 1, history.length + 1) : series.length,
                total: runningTotal,
                endless: mode === 'endless',
                lives: ENDLESS_LIVES - missed,
                maxLives: ENDLESS_LIVES,
                onExit: goHome,
              }
            : null
        }
      />

      {toastAchievement && <Toast achievement={toastAchievement} accent={accent} />}

      <div className="relative z-1">
        {screen === 'rules' && (
          <Rules
            accent={accent}
            onStart={() => {
              markOnboarded()
              const start = pendingStart
              setPendingStart(null)
              start?.()
            }}
          />
        )}

        {screen === 'home' && (
          <Home
            day={today}
            played={played}
            streak={streak}
            bestEndless={getBestEndless()}
            seriesLength={dailySeries.length}
            resume={getProgress(today)}
            hero={hero.slug}
            accent={accent}
            unlocked={profile.unlocked}
            onHero={(slug) => {
              beep('swipe')
              keep({ ...profile, hero: slug })
            }}
            onDaily={() => withRules(startDaily)}
            onEndless={() => withRules(startEndless)}
            onAch={() => {
              beep('tap')
              setPrevScreen('home')
              setScreen('ach')
            }}
            level={settings.level}
            stacks={settings.stacks}
            counts={counts}
            setSize={setSize}
            onLevel={(level: LevelId) => {
              beep('toggle')
              changeSettings({ ...settings, level })
            }}
            onToggle={(stack: Stack) => {
              beep('toggle')
              changeSettings({
                ...settings,
                stacks: settings.stacks.includes(stack)
                  ? settings.stacks.filter((s) => s !== stack)
                  : [...settings.stacks, stack],
              })
            }}
            onSet={() => withRules(startSet)}
          />
        )}

        {screen === 'ach' && (
          <Achievements
            unlocked={profile.unlocked}
            accent={accent}
            onBack={() => {
              beep('tap')
              setScreen(prevScreen)
            }}
          />
        )}

        {screen === 'briefing' && (
          <Briefing
            task={task}
            agent={agent}
            line={briefLine(agent, index)}
            seconds={duration}
            onStart={() => {
              beep('start')
              setScreen('review')
            }}
          />
        )}

        {screen === 'review' && (
          <Review
            task={task}
            tokens={tokens}
            accent={accent}
            left={left}
            duration={duration}
            selected={selected}
            marks={marks}
            attempts={attempts}
            shake={shake}
            onPick={pickLine}
            onSubmit={submit}
          />
        )}

        {screen === 'reason' && pending && (
          <Reason
            task={task}
            tokens={tokens}
            accent={accent}
            picks={pending.picks}
            options={options}
            onAnswer={answerReason}
          />
        )}

        {screen === 'verdict' && (
          <Verdict
            task={task}
            tokens={tokens}
            outcome={outcome}
            score={score}
            picks={picks}
            wrongPicks={wrongPicks}
            coverage={coverage}
            secondsLeft={secondsLeft}
            reason={chosenReason}
            rightReason={options.find((o) => o.right) ?? null}
            stats={stats}
            hasNext={!runOver}
            onNext={next}
          />
        )}

        {screen === 'summary' && (
          <Summary
            mode={mode}
            day={today}
            history={history}
            seconds={seconds}
            newRecord={newRecord}
            lifetime={profile.lifetime}
            accent={accent}
            stats={stats}
            onHome={goHome}
          />
        )}
      </div>
    </div>
  )
}
