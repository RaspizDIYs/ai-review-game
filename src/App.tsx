import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import pack from './content/pack.json'
import reasons from './content/reasons.json'
import incidents from './content/incidents.json'
import type { Outcome, Stack, Task } from './types'
import { accuracy, roundDuration, roundScore } from './scoring.ts'
import {
  ENDLESS_LIVES,
  isRunOver,
  MAX_ATTEMPTS,
  resolveSubmit,
  resolveTimeout,
  type Coverage,
  type SubmitResult,
} from './round.ts'
import { dayKey, pickDaily, pickEndless, pickShift } from './daily.ts'
import { availability, level, pickSet, type LevelId } from './levels.ts'
import { DEFAULT_SHIFT_STACK, shiftStacks, STACKS, type ShiftStack } from './stacks.ts'
import {
  getBestEndless,
  getDaily,
  getProfile,
  getProgress,
  getSettings,
  getShift,
  getStreak,
  isOnboarded,
  markOnboarded,
  saveDaily,
  saveEndless,
  saveProfile,
  saveProgress,
  saveSettings,
  saveShift,
  type Profile,
  type Settings,
} from './storage.ts'
import { isWin } from './share.ts'
import { trackRound, trackSeries } from './analytics.ts'
import { loadStats, type Stats } from './stats.ts'
import { loadTokens } from './tokens.ts'
import { reasonOptions, WRONG_REASON_FACTOR, type ReasonOption } from './reason.ts'
import { AGENTS, agentFor, briefLine, type AgentSlug } from './agents.ts'
import {
  ACHIEVEMENTS,
  achievement,
  derivedUnlocks,
  ownedCount,
  roundUnlocks,
  runUnlocks,
} from './achievements.ts'
import { beep, setSoundEnabled } from './sound.ts'
import {
  armMusic,
  DEFAULT_MUSIC,
  nextTrack,
  onMusicTrack,
  setMusicEnabled,
  setMusicVolume,
  type Track,
} from './music.ts'
import { normalizeRepo, PR_BASE, pullRequest } from './pr.ts'
import { leavesDefect, type Defect } from './defects.ts'
import { START as PROD_START } from './prod.ts'
import { logFor, type IncidentLog } from './incident.ts'
import {
  carry,
  cleanup as cleanupTurn,
  finish as finishShift,
  isShiftOver,
  merged,
  repair as repairShift,
  restore as restoreShift,
  review as shiftReview,
  start as startShiftState,
  type Shift,
} from './shift.ts'
import { useCountdown } from './countdown.ts'
import { Achievements } from './components/Achievements.tsx'
import { Briefing } from './components/Briefing.tsx'
import { Chrome } from './components/Chrome.tsx'
import type { LineState } from './components/DiffView.tsx'
import { Home } from './components/Home.tsx'
import { Incident } from './components/Incident.tsx'
import { RepairPick } from './components/RepairPick.tsx'
import { Setup } from './components/Setup.tsx'
import { ShiftEnd } from './components/ShiftEnd.tsx'
import { TurnPick } from './components/TurnPick.tsx'
import { Reason } from './components/Reason.tsx'
import { Review } from './components/Review.tsx'
import { Rules } from './components/Rules.tsx'
import { Summary, type Played } from './components/Summary.tsx'
import { Toast } from './components/Toast.tsx'
import { Verdict } from './components/Verdict.tsx'

const POOL = pack as Task[]
const REASONS = reasons as Record<string, string>
const INCIDENTS = incidents as IncidentLog[]
/** Названия задач для сводки смены: журнал хранит только id. */
const TITLES = new Map(POOL.map((t) => [t.id, t.title]))

type Screen =
  | 'home'
  | 'rules'
  | 'setup'
  | 'turn'
  | 'repair'
  | 'briefing'
  | 'review'
  | 'reason'
  | 'verdict'
  | 'incident'
  | 'summary'
  | 'shift-end'
  | 'ach'
type Mode = 'daily' | 'endless' | 'set' | 'shift'

/** Языки, по которым в паке вообще что-то есть, — на них и настраивается подборка. */
const PLAYABLE = STACKS.filter((s) => POOL.some((t) => t.stack === s))
const DEFAULT_SETTINGS: Settings = {
  level: 'junior',
  stacks: PLAYABLE,
  played: 0,
  shiftStack: DEFAULT_SHIFT_STACK,
}

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

  /** Сколько задач в паке по каждому языку — для выбора стека смены. */
  const packCounts = useMemo(() => {
    const map = new Map<Stack, number>()
    for (const task of POOL) map.set(task.stack, (map.get(task.stack) ?? 0) + 1)
    return map
  }, [])

  /**
   * Из чего собирается забег. Челлендж настройки не спрашивает — он у всех
   * одинаковый. Бесконечный режется уровнем и языками, смена — своим стеком,
   * и потолка сложности там нет.
   */
  const endlessPool = useMemo(() => {
    const max = level(settings.level).max
    const own = POOL.filter((t) => settings.stacks.includes(t.stack) && t.difficulty <= max)
    return own.length > 0 ? own : POOL
  }, [settings.level, settings.stacks])

  const shiftPool = useMemo(() => {
    const own = shiftStacks(settings.shiftStack)
    const picked = POOL.filter((t) => own.includes(t.stack))
    return picked.length > 0 ? picked : POOL
  }, [settings.shiftStack])

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
  /** Какой режим настраивается перед стартом. Челлендж не спрашивает ничего. */
  const [setup, setSetup] = useState<'endless' | 'set' | 'shift'>('endless')

  /**
   * Смена живёт отдельно от серии раундов: у неё своё состояние прода,
   * которое переезжает в следующую смену через localStorage.
   */
  const [shift, setShift] = useState<Shift | null>(() => restoreShift(getShift()))
  /** Что рвануло на последнем ходу — показывается после вердикта. */
  const [fired, setFired] = useState<Defect[]>([])
  /** Чиним свой мёрдж: тот же диф, но размечаем его заново и без таймера. */
  const [repairing, setRepairing] = useState<{ pr: number; task: Task } | null>(null)
  /** Сколько раз лазили в каждый PR — единственное, что игра о починке помнит. */
  const [tried, setTried] = useState<Map<number, number>>(new Map())

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

  const [track, setTrack] = useState<Track | null>(null)
  useEffect(() => onMusicTrack(setTrack), [])
  useEffect(() => armMusic(), [])
  useEffect(() => setMusicVolume(profile.music), [profile.music])
  useEffect(() => setMusicEnabled(profile.musicOn), [profile.musicOn])

  const endlessSeed = useRef('')
  const played = getDaily(today)
  const streak = getStreak(today)
  /**
   * Усталость. В серии её считают пропуски: три подряд — и дальше играешь
   * на минимальном таймере, а серия короткая, так и задумано.
   *
   * В смене таких ходов четырнадцать, и накопленные пропуски прибили бы
   * таймер к полу на весь остаток. Поэтому там усталость меряется не тем,
   * сколько раз ты ошибся, а тем, сколько мин сейчас лежит в проде: разгрёб
   * долг — выспался. Заодно у уборки появляется вторая, немедленная польза.
   */
  const duration = repairing
    ? 0
    : roundDuration(mode === 'shift' && shift ? shift.defects.length : missed)
  // Смена кончается по своим правилам: по ходам либо по шкалам прода.
  const runOver =
    mode === 'shift'
      ? shift === null || isShiftOver(shift)
      : isRunOver(mode, index, series.length, missed)

  const agent = agentFor(task.stack)
  const hero = AGENTS[profile.hero as AgentSlug] ?? AGENTS.commander
  // Внутри раунда интерфейс красится под агента задачи, снаружи — под выбранного.
  // Инцидент — часть хода, а не отдельный экран: шкалы и счётчик ходов
  // должны остаться на месте, иначе алерт читается как выход из смены.
  const inRun =
    screen === 'turn' ||
    screen === 'briefing' ||
    screen === 'review' ||
    screen === 'reason' ||
    screen === 'verdict' ||
    screen === 'incident'
  const accent = inRun ? agent.color : hero.color

  const options = useMemo(() => reasonOptions(task, POOL, REASONS), [task])

  // Пул-реквест раунда: имя репозитория — из настроек игрока, заголовок и
  // ветка — из самой задачи, номер растёт по ходу серии.
  const repo = normalizeRepo(profile.repo)
  // В смене номер PR ведёт сама смена: он сквозной и именно его называет
  // потом алерт. Вне смены номер — украшение и считается от раунда.
  // Чиним — в шапке должен стоять тот PR, который открыли, а не следующий.
  const prNumber = repairing ? repairing.pr : mode === 'shift' && shift ? shift.pr : PR_BASE + index
  const prTask = repairing?.task ?? task
  const pr = useMemo(() => pullRequest(prTask, prNumber, repo), [prTask, prNumber, repo])

  function keep(next: Profile) {
    setProfile(next)
    saveProfile(next)
  }

  function unlock(ids: string[], base: Profile) {
    const owned = [...base.unlocked]
    const fresh: string[] = []
    const add = (list: string[]) => {
      for (const id of list) {
        if (owned.includes(id)) continue
        owned.push(id)
        fresh.push(id)
      }
    }

    add(ids)
    // «Полиглот» и «Коллекционер» считаются от остального списка, поэтому
    // прогоняются после — и по кругу: полиглот сам открывает коллекционера.
    for (let i = 0; i < 2; i++) add(derivedUnlocks(owned))

    if (fresh.length === 0) {
      keep(base)
      return
    }

    keep({ ...base, unlocked: owned })

    // В смене тост не всплывает: «Первый улов» появляется ровно тогда, когда
    // игрок угадал, и выдаёт ответ. Ачивка засчитана, показать её успеем
    // в разборе.
    if (mode === 'shift') return

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
      // Усталость и жизни — за всё, что уехало в прод. Частичный ответ тоже:
      // часть подлянки осталась в коде, и ночью она разбудит так же, как целая.
      // Тот же признак рождает скрытый дефект в смене — источник правды один.
      const nextMissed = missed + (leavesDefect(result.outcome) ? 1 : 0)
      const nextSeconds = seconds + spent
      const nextStreak = win ? foundStreak + 1 : 0
      const lifetime = profile.lifetime + points
      const found = profile.found + (result.outcome === 'found' ? 1 : 0)

      setOutcome(result.outcome)
      setScore(points)
      setPicks(result.picks)
      setCoverage(result.coverage)
      setSecondsLeft(result.secondsLeft)
      setHistory(nextHistory)
      setMissed(nextMissed)
      setSeconds(nextSeconds)
      setFoundStreak(nextStreak)

      // Ход смены разрешается здесь же: пропуск должен уехать в прод в тот
      // самый момент, когда игрок его пропустил, а не когда нажал «дальше».
      if (mode === 'shift' && shift) {
        const turn = shiftReview(shift, task, result.outcome)
        setShift(turn.shift)
        setFired(turn.fired)
        saveShift(turn.shift)

        // Смена играется вслепую: вердикта нет. Единственное, что игрок
        // видит после решения, — прод. См. «Слепая смена — Ревью за ИИ».
        beep('tap')
        if (turn.fired.length > 0) setScreen('incident')
        else nextTurn(turn.shift)
        return
      }

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
          found,
        }),
        { ...profile, lifetime, found },
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
    [task, duration, mode, history, missed, seconds, index, today, profile, foundStreak, shift],
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
    screen === 'review' && !repairing,
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

  /**
   * Починка своими руками: игрок заново разметил собственный мёрдж.
   * Второй попытки здесь нет — вслепую она означала бы «промазал, попробуй ещё».
   */
  function submitRepair() {
    if (!repairing || !shift) return

    const result = resolveSubmit(repairing.task, selected, MAX_ATTEMPTS - 1)
    if (result.kind !== 'finish') return

    beep('stamp')
    const turn = repairShift(shift, repairing.pr, repairing.task, result.outcome)
    setShift(turn.shift)
    saveShift(turn.shift)
    setTried((prev) => new Map(prev).set(repairing.pr, (prev.get(repairing.pr) ?? 0) + 1))
    setRepairing(null)
    resetRound()

    if (turn.fired.length > 0) {
      setFired(turn.fired)
      setScreen('incident')
      return
    }
    setScreen(finishShift(turn.shift).verdict === 'alive' ? 'repair' : 'shift-end')
  }

  function startRepair(pr: number, taskId: string) {
    const found = POOL.find((t) => t.id === taskId)
    if (!found) return

    beep('tap')
    resetRound()
    setRepairing({ pr, task: found })
    setScreen('review')
  }

  function submit() {
    if (screen !== 'review') return
    if (repairing) {
      submitRepair()
      return
    }

    const result = resolveSubmit(task, selected, attempts)
    const next = apply(result)
    if (!next) return

    const done: Pending = { ...next, secondsLeft: left }

    // Нашёл строку — спрашиваем, чем она плоха. Время в этот момент уже
    // остановлено: шаг «почему» проверяет понимание, а не скорость чтения.
    //
    // В смене шага нет: сам вопрос «что не так с этой строкой» уже говорит,
    // что строка та самая, а смена играется вслепую.
    if (
      mode !== 'shift' &&
      (done.outcome === 'found' || done.outcome === 'partial') &&
      options.length > 0
    ) {
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

  /**
   * Смена. Незаконченная продолжается с того же хода, законченная отдаёт
   * следующей свой прод: он и есть то, что игрок оставил после себя.
   */
  function startShift(fresh = false) {
    beep('start')
    const saved = restoreShift(getShift())
    const survived = saved !== null && finishShift(saved).verdict === 'alive'

    // Смена доиграна, прод жив — сначала разбор завалов, а не новая смена.
    // Иначе, уйдя с экрана, игрок терял единственную возможность починить.
    if (!fresh && saved && survived && isShiftOver(saved)) {
      endlessSeed.current = `shift:${today}:${saved.pr}`
      setMode('shift')
      setShift(saved)
      setFired([])
      resetRun()
      setScreen('repair')
      return
    }

    // Прод переносится, только если он пережил прошлую смену. Сгоревший
    // начинается заново: иначе первая же проигранная смена запирает режим
    // навсегда. Нумерация PR при этом не сбрасывается — репозиторий тот же.
    const next =
      saved && !isShiftOver(saved)
        ? saved
        : startShiftState(
            saved
              ? survived
                ? carry(saved)
                : { prod: PROD_START, defects: [], pr: saved.pr }
              : undefined,
          )

    endlessSeed.current = `shift:${today}:${next.pr}`
    setMode('shift')
    setSeries([])
    setShift(next)
    setFired([])
    saveShift(next)
    resetRun()
    setIndex(next.turn)
    setTask(pickShift(shiftPool, endlessSeed.current, next.turn))
    setScreen('turn')
  }

  /** Следующий ход смены — либо конец, если прод или ходы кончились. */
  function nextTurn(current: Shift) {
    if (isShiftOver(current)) {
      beep('win')
      setScreen('shift-end')
      return
    }

    const i = current.turn
    setIndex(i)
    setTask(pickShift(shiftPool, endlessSeed.current, i, history.slice(-5).map((h) => h.task.id)))
    resetRound()
    setScreen('turn')
  }

  /** Ход уборки: разгрести долг вместо того, чтобы смотреть новый PR. */
  function doCleanup() {
    if (!shift) return

    beep('toggle')
    const turn = cleanupTurn(shift)
    setShift(turn.shift)
    setFired(turn.fired)
    saveShift(turn.shift)

    if (turn.fired.length > 0) {
      setScreen('incident')
      return
    }
    nextTurn(turn.shift)
  }

  function startEndless() {
    beep('start')
    endlessSeed.current = `${today}:${performance.now()}`
    setMode('endless')
    setSeries([])
    setIndex(0)
    setTask(pickEndless(endlessPool, endlessSeed.current, 0))
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
    unlock(
      runUnlocks({
        mode: runMode,
        outcomes: rounds.map((h) => h.outcome),
        // Серия дня уже записана выше, так что счётчик здесь свежий.
        streak: getStreak(today),
      }),
      profile,
    )
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

    if (mode === 'shift' && shift) {
      // Сначала показываем, что рвануло: иначе алерт теряется за брифингом
      // следующего PR и связь с собственным мёрджем не читается.
      if (fired.length > 0) {
        setScreen('incident')
        return
      }
      nextTurn(shift)
      return
    }

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
          pickEndless(endlessPool, endlessSeed.current, i, history.slice(-5).map((h) => h.task.id))
        : series[i],
    )
    resetRound()
    setScreen('briefing')
  }

  /**
   * Инцидент показан. Во время смены с ним ничего не сделать — чинят после,
   * поэтому дальше просто следующий ход. Если смена уже кончилась, из алерта
   * попадаем в разбор завалов.
   */
  function afterIncident() {
    beep('tap')
    const rest = fired.slice(1)
    setFired(rest)
    if (rest.length > 0 || !shift) return

    if (!isShiftOver(shift)) nextTurn(shift)
    else setScreen(finishShift(shift).verdict === 'alive' ? 'repair' : 'shift-end')
  }

  /** Настройка появляется под режим, а не висит колонкой на главной. */
  function openSetup(mode: 'endless' | 'set' | 'shift') {
    beep('tap')
    setSetup(mode)
    setScreen('setup')
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
        repo={profile.repo}
        onRepo={(next) => keep({ ...profile, repo: next })}
        pr={inRun ? pr : null}
        achCount={ownedCount(profile.unlocked)}
        achTotal={ACHIEVEMENTS.length}
        audio={{
          sound: profile.sound,
          music: profile.music,
          musicOn: profile.musicOn,
          track,
          onSound: () => {
            const on = !profile.sound
            setSoundEnabled(on)
            keep({ ...profile, sound: on })
            if (on) setTimeout(() => beep('toggle'), 30)
          },
          // Ползунок дёргается непрерывно — в localStorage пишем то же, что
          // видит игрок: значений мало, и терять их на перезагрузке обиднее.
          onMusic: (music: number) => keep({ ...profile, music, musicOn: music > 0 }),
          onMusicToggle: () => keep({ ...profile, musicOn: !profile.musicOn }),
          onNext: () => {
            beep('tap')
            nextTrack()
          },
          onMute: (m: boolean) => {
            setSoundEnabled(!m)
            keep({
              ...profile,
              sound: !m,
              musicOn: !m,
              // Включить звук при нулевом ползунке — это тишина и недоумение.
              music: m || profile.music > 0 ? profile.music : DEFAULT_MUSIC,
            })
            if (!m) setTimeout(() => beep('toggle'), 30)
          },
        }}
        onAch={() => {
          beep('tap')
          setPrevScreen(screen)
          setScreen('ach')
        }}
        run={
          inRun
            ? {
                // В смене ходы считает журнал: уборка тоже тратит ход,
                // а в истории раундов её нет.
                outcomes:
                  mode === 'shift' && shift
                    ? shift.log.flatMap((e) =>
                        e.kind === 'incident'
                          ? []
                          : [e.kind === 'merged' || e.kind === 'blocked' ? e.outcome : 'cleanup'],
                      )
                    : history.map((h) => h.outcome),
                index,
                length:
                  mode === 'shift' && shift
                    ? shift.turns
                    : mode === 'endless'
                      ? Math.max(index + 1, history.length + 1)
                      : series.length,
                total: runningTotal,
                endless: mode === 'endless',
                lives: ENDLESS_LIVES - missed,
                maxLives: ENDLESS_LIVES,
                prod: mode === 'shift' && shift ? { ...shift.prod, delta: shift.delta } : null,
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

        {screen === 'setup' && (
          <Setup
            mode={setup}
            accent={accent}
            level={settings.level}
            stacks={settings.stacks}
            counts={counts}
            setSize={setSize}
            onLevel={(next: LevelId) => {
              beep('toggle')
              changeSettings({ ...settings, level: next })
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
            shiftStack={settings.shiftStack}
            packCounts={packCounts}
            onShiftStack={(next: ShiftStack) => {
              beep('toggle')
              changeSettings({ ...settings, shiftStack: next })
            }}
            onStart={() =>
              withRules(
                setup === 'shift' ? () => startShift() : setup === 'set' ? startSet : startEndless,
              )
            }
            onBack={goHome}
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
            // Челлендж настройки не спрашивает: он у всех одинаковый, и в этом
            // весь смысл. Остальные режимы сначала показывают свою.
            onDaily={() => withRules(startDaily)}
            onEndless={() => openSetup('endless')}
            onShift={() => openSetup('shift')}
            shift={
              shift && {
                health: shift.prod.health,
                turn: shift.turn,
                turns: shift.turns,
                unfinished: !isShiftOver(shift),
                lost: isShiftOver(shift) && finishShift(shift).verdict !== 'alive',
              }
            }
            onAch={() => {
              beep('tap')
              setPrevScreen('home')
              setScreen('ach')
            }}
            setSize={setSize}
            onSet={() => openSetup('set')}
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

        {screen === 'turn' && shift && (
          <TurnPick
            turn={shift.turn}
            turns={shift.turns}
            pr={pr}
            task={task}
            agentName={agent.name}
            health={shift.prod.health}
            accent={accent}
            onReview={() => {
              beep('tap')
              setScreen('briefing')
            }}
            onCleanup={doCleanup}
          />
        )}

        {screen === 'briefing' && (
          <Briefing
            task={task}
            agent={agent}
            pr={pr}
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
            task={repairing?.task ?? task}
            tokens={repairing ? undefined : tokens}
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
            // В смене «следующий PR» — неправда: следующим будет выбор хода,
            // а до него ещё может прилететь алерт.
            nextLabel={mode === 'shift' ? (runOver ? 'Закрыть смену' : 'Дальше') : undefined}
            onNext={next}
          />
        )}

        {screen === 'incident' && fired[0] && shift && (
          <Incident
            defect={fired[0]}
            log={logFor(fired[0], INCIDENTS)}
            delta={shift.delta}
            accent={accent}
            onNext={afterIncident}
          />
        )}

        {screen === 'repair' && shift && (
          <RepairPick
            merged={merged(shift, shift.turns)}
            titles={TITLES}
            tried={tried}
            health={shift.prod.health}
            accent={accent}
            onPick={startRepair}
            onDone={() => startShift(true)}
          />
        )}

        {screen === 'shift-end' && shift && (
          <ShiftEnd
            summary={finishShift(shift)}
            log={shift.log}
            turns={shift.turn}
            accent={accent}
            titles={TITLES}
            // Правду показываем, только когда игра кончилась: пока прод жив,
            // разбор превратил бы слепую починку в чтение ответов.
            reveal={finishShift(shift).verdict !== 'alive'}
            onRepair={
              finishShift(shift).verdict === 'alive' && merged(shift, shift.turns).length > 0
                ? () => setScreen('repair')
                : null
            }
            onNext={finishShift(shift).verdict === 'alive' ? () => startShift(true) : null}
            onHome={goHome}
          />
        )}

        {screen === 'summary' && mode !== 'shift' && (
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
