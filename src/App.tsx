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
import {
  AGENTS,
  AGENT_SLUGS,
  authorOf,
  briefLine,
  castOf,
  handwritingOf,
  type AgentSlug,
} from './agents.ts'
import { codeNote } from './note.ts'
import { replyTo } from './replies.ts'
import {
  caught as watchCaught,
  greeting,
  report,
  run as runTerminal,
  type TerminalLine,
} from './terminal.ts'
import {
  ACHIEVEMENTS,
  achievement,
  derivedUnlocks,
  dossierUnlocks,
  ownedCount,
  roundUnlocks,
  runUnlocks,
  shiftUnlocks,
} from './achievements.ts'
import { beep, setSoundEnabled, setTypingEnabled } from './sound.ts'
import {
  armMusic,
  nextTrack,
  onMusicTrack,
  setMusicEnabled,
  setMusicVolume,
  setPlaylist,
  type Track,
} from './music.ts'
import { normalizeRepo, PR_BASE, pullRequest } from './pr.ts'
import { leavesDefect, slowdown, state as prodState, type Defect } from './defects.ts'
import { START as PROD_START } from './prod.ts'
import { logFor, type IncidentLog } from './incident.ts'
import {
  carry,
  cleanup as cleanupTurn,
  finish as finishShift,
  isCheckpoint,
  isShiftOver,
  merged,
  probe as probeShift,
  repair as repairShift,
  restore as restoreShift,
  review as shiftReview,
  start as startShiftState,
  watch as watchTurn,
  type Shift,
} from './shift.ts'
import { useCountdown, useStopwatch } from './countdown.ts'
import { Achievements } from './components/Achievements.tsx'
import { Briefing } from './components/Briefing.tsx'
import { Chrome } from './components/Chrome.tsx'
import type { LineState } from './components/DiffView.tsx'
import { Home } from './components/Home.tsx'
import { Incident } from './components/Incident.tsx'
import { Postmortem } from './components/Postmortem.tsx'
import { RepairPick } from './components/RepairPick.tsx'
import { Setup } from './components/Setup.tsx'
import { ShiftEnd } from './components/ShiftEnd.tsx'
import { Reason } from './components/Reason.tsx'
import { Reply } from './components/Reply.tsx'
import { RepoSetup } from './components/RepoSetup.tsx'
import { Review } from './components/Review.tsx'
import { Settings as SettingsPanel } from './components/Settings.tsx'
import { Terminal } from './components/Terminal.tsx'
import { Tick } from './components/Tick.tsx'
import { Rules } from './components/Rules.tsx'
import { Summary, type Played } from './components/Summary.tsx'
import { Toast } from './components/Toast.tsx'
import { Verdict } from './components/Verdict.tsx'

const POOL = pack as Task[]
const REASONS = reasons as Record<string, string>
const INCIDENTS = incidents as IncidentLog[]
/** Названия задач для сводки смены: журнал хранит только id. */
const TITLES = new Map(POOL.map((t) => [t.id, t.title]))
/** Дифы по id — из них список починки считает «+5 −1» для карточки. */
const DIFFS = new Map(POOL.map((t) => [t.id, t.diff]))

type Screen =
  | 'home'
  | 'rules'
  | 'setup'
  | 'repair'
  | 'postmortem'
  | 'briefing'
  | 'review'
  | 'reason'
  | 'verdict'
  | 'incident'
  | 'tick'
  | 'summary'
  | 'shift-end'
  | 'ach'
type Mode = 'daily' | 'endless' | 'set' | 'shift'

/** Экраны вне игры: на них играет заглавная тема. */
const MENU_SCREENS: Screen[] = ['home', 'rules', 'setup', 'ach']

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
  /**
   * Черновик правок: PR → строки, которые игрок в нём отметил.
   *
   * Отметки не отправляются сразу. Раньше отправлялись — и получалась
   * мясорубка: открыл PR, ткнул строку, сразу получил невидимый пересчёт
   * здоровья, вернулся, ткнул другую — и так до конца игры на одном PR.
   * Теперь разметка живёт черновиком, её видно в списке, её можно менять,
   * а считается всё разом на «работать дальше».
   */
  const [drafts, setDrafts] = useState<Map<number, number[]>>(new Map())
  /** Сколько раз лазили в каждый PR — единственное, что игра о починке помнит. */
  const [tried, setTried] = useState<Map<number, number>>(new Map())
  /** Чиним на упавшем проде посреди смены или спокойно между сменами. */
  const [urgent, setUrgent] = useState(false)
  /** Плановая сверка каждые четыре хода: смотрим на прод и работаем дальше. */
  const [checkpoint, setCheckpoint] = useState(false)
  /**
   * На каком ходу сверку уже показали.
   *
   * Без этого авария на четвёртом ходу съедала сверку: игрок уходил чинить
   * с экрана инцидента, а возврат вёл сразу в новый ход. Теперь сверка
   * привязана к номеру хода, а не к тому, каким путём до него дошли, —
   * и по кругу ходить всё равно не даёт.
   */
  const [checkedAt, setCheckedAt] = useState(-1)

  /** Настройки: модалка поверх любого экрана. */
  const [settingsOpen, setSettingsOpen] = useState(false)

  /** Терминал: открыт ли и что в нём напечатано. */
  const [termOpen, setTermOpen] = useState(false)
  const [termLines, setTermLines] = useState<TerminalLine[]>([])
  /** Историю на этом ходу уже поднимали: `/git-blame` доступен раз за ход. */
  const [blamed, setBlamed] = useState(false)
  /** Строки, на которые повешен лог. Пока он висит, второй раз следить нельзя. */
  const [watching, setWatching] = useState<number[]>([])
  /**
   * Реплика агента после отправки — живёт несколько секунд и пропадает.
   * Автора храним вместе с фразой: к моменту показа на экране уже может идти
   * следующий PR, и подписывать чужую реплику новым агентом нельзя.
   */
  const [reply, setReply] = useState<{ agent: AgentSlug; line: string } | null>(null)
  /** Открытый разбор одного PR: из отчёта по смене или из списка починки. */
  const [postmortem, setPostmortem] = useState<{ task: Task; pr: number; back: Screen } | null>(
    null,
  )
  /**
   * Сколько здоровья вернула последняя уборка — показывается на экране разбора.
   *
   * Гаснет, как только игрок делает что-то ещё. Иначе «+5» от уборки висит
   * рядом со шкалой, пока неудачная починка эту шкалу опускает, и экран
   * выглядит враньём: здоровье падает, а плюс висит. Дельту самой починки
   * показывать нельзя — «−8» означало бы «ты полез в чистый PR».
   */
  const [healed, setHealed] = useState<number | null>(null)

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
  useEffect(() => setTypingEnabled(profile.typing), [profile.typing])

  const [track, setTrack] = useState<Track | null>(null)
  useEffect(() => onMusicTrack(setTrack), [])
  useEffect(() => armMusic(), [])
  useEffect(() => setMusicVolume(profile.music), [profile.music])
  useEffect(() => setMusicEnabled(profile.musicOn), [profile.musicOn])
  // Главный экран звучит заглавной темой и только ею, режимы — перетасованным
  // мешком остального. Плейлист переключается по экрану, а не по кнопке
  // «начать»: выйти из смены на главную — это тоже вернуться к теме.
  useEffect(() => setPlaylist(MENU_SCREENS.includes(screen) ? 'menu' : 'game'), [screen])

  /**
   * Награды за смену. Отдельным эффектом, а не в момент хода: у смены нет
   * «конца серии», в который можно было бы всё посчитать, — она заканчивается
   * из четырёх разных мест.
   */
  useEffect(() => {
    if (screen !== 'shift-end' || !shift) return
    unlock(
      shiftUnlocks({
        alive: finishShift(shift).verdict === 'alive',
        finished: isShiftOver(shift),
        crashes: shift.log.filter((e) => e.kind === 'incident').length,
        cured:
          shift.log.some((e) => e.kind === 'incident') &&
          shift.log.some((e) => e.kind === 'repair' && e.result === 'cured'),
        day: shift.day,
      }),
      profile,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const endlessSeed = useRef('')
  const played = getDaily(today)
  const streak = getStreak(today)
  /**
   * Таймер. В тренировочных режимах он и есть половина задачи: 90 секунд,
   * усталость после пропуска, спешка.
   *
   * **В смене таймера нет.** Там ход стоит дороже секунды: есть терминал,
   * досье, слежка — всё это про «подумать», и обратный отсчёт заставлял бы
   * торопиться ровно там, где торопиться не надо. Время не исчезает: его
   * считает секундомер и показывает отчёт по смене.
   */
  const duration = repairing || mode === 'shift' ? 0 : roundDuration(missed)
  // Смена кончается по своим правилам: по ходам либо по шкалам прода.
  const runOver =
    mode === 'shift'
      ? shift === null || isShiftOver(shift)
      : isRunOver(mode, index, series.length, missed)

  // Автор PR — не от языка, а от почерка ошибок: язык агента больше ничего
  // не значит, зато тип подлянки значит всё. См. `authorOf`.
  const agent = repairing
    ? authorOf(repairing.task, repairing.pr)
    : authorOf(task, mode === 'shift' && shift ? shift.pr : index)
  const hero = AGENTS[profile.hero as AgentSlug] ?? AGENTS.commander
  /**
   * В смене автор PR — тайна, и это вся её вторая половина: кто писал код,
   * выясняют через `/git-blame`, а не читают в шапке. Поэтому там ни портрета,
   * ни имени, ни цвета агента — интерфейс красится в цвет выбранного героя,
   * который об авторе ничего не говорит.
   */
  const anonymous = mode === 'shift'
  // Внутри раунда интерфейс красится под агента задачи, снаружи — под выбранного.
  // Инцидент — часть хода, а не отдельный экран: шкалы и счётчик ходов
  // должны остаться на месте, иначе алерт читается как выход из смены.
  const inRun =
    screen === 'briefing' ||
    screen === 'review' ||
    screen === 'reason' ||
    screen === 'verdict' ||
    screen === 'incident' ||
    screen === 'tick'
  const accent = inRun && !anonymous ? agent.color : hero.color

  const options = useMemo(() => reasonOptions(task, POOL, REASONS), [task])

  /**
   * Кто сегодня на смене. Челлендж, бесконечный и подборка набираются по
   * языкам — смена набирается по характерам: за двенадцать ходов один и тот же
   * почерк должен попасться несколько раз, иначе собранное досье не окупается.
   */
  const hands = useMemo(
    () => (shift ? handwritingOf(castOf(`day:${shift.day}`)) : null),
    // Только от номера дня: смена агентов меняется вместе с рабочим днём,
    // а не на каждый тик прода.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shift?.day],
  )

  // Пул-реквест раунда: имя репозитория — из настроек игрока, заголовок и
  // ветка — из самой задачи, номер растёт по ходу серии.
  /**
   * PR, в которых подлянки больше нет: закрыл руками или разгребла уборка.
   * В списке починки они помечены переписанными — чинить там нечего.
   */
  const fixedPrs = useMemo(() => {
    const set = new Set<number>()
    for (const e of shift?.log ?? []) {
      if (e.kind === 'repair' && e.result === 'cured') set.add(e.pr)
      if (e.kind === 'cleanup' && e.pr !== null) set.add(e.pr)
    }
    return set
  }, [shift])

  /** Кто закрыл: своими руками или уборкой. От этого зависит текст разбора. */
  const cleanedPrs = useMemo(() => {
    const set = new Set<number>()
    for (const e of shift?.log ?? []) {
      if (e.kind === 'cleanup' && e.pr !== null) set.add(e.pr)
    }
    return set
  }, [shift])

  const repo = normalizeRepo(profile.repo)
  // В смене номер PR ведёт сама смена: он сквозной и именно его называет
  // потом алерт. Вне смены номер — украшение и считается от раунда.
  // Чиним — в шапке должен стоять тот PR, который открыли, а не следующий.
  const prNumber = repairing ? repairing.pr : mode === 'shift' && shift ? shift.pr : PR_BASE + index
  const prTask = repairing?.task ?? task
  const pr = useMemo(() => pullRequest(prTask, prNumber, repo), [prTask, prNumber, repo])

  /**
   * Комментарий автора в коде. Бесплатная зацепка про характер: он не
   * показывает на подлянку, но звучит так, как думает тот, кто её сделал.
   */
  const authorNote = useMemo(
    () => codeNote(prTask, agent, `${prNumber}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prTask.id, agent.slug, prNumber],
  )

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
    // в разборе — там смена уже кончилась и выдавать нечего.
    if (mode === 'shift' && screen !== 'shift-end') return

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
        const turn = shiftReview(shift, task, result.outcome, elapsed.current)
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

  // Нулевая длительность — это «таймера нет» (смена и починка), а не «время
  // вышло». Без этой проверки отсчёт срабатывал мгновенно и отправлял PR
  // в прод сам, не дав игроку открыть диф.
  const left = useCountdown(
    screen === 'review' && !repairing && duration > 0,
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

  /**
   * Секундомер смены. Идёт, пока игрок читает диф, и обнуляется на каждом
   * ходу — от номера PR и хода: возвращённый с логирования PR начинает
   * отсчёт заново, это уже другой ход.
   */
  const stopwatch = useStopwatch(
    screen === 'review' && mode === 'shift' && !repairing,
    `${shift?.turn ?? 0}:${shift?.pr ?? 0}`,
  )
  // Через ref, а не через зависимость: секундомер тикает десять раз в секунду,
  // и пересобирать из-за него обработчик хода незачем.
  const elapsed = useRef(0)
  elapsed.current = stopwatch

  const marks = useMemo(() => {
    const m = new Map<number, LineState>()
    for (const line of wrongPicks) m.set(line, 'wrong')
    for (const line of selected) m.set(line, 'picked')
    return m
  }, [wrongPicks, selected])

  /**
   * Терминал. Живёт только в смене: `/grab-evidence` тратит ход, а `/deploy
   * --dry-run` спрашивает у прода — ни того, ни другого нет ни в челлендже,
   * ни в подборке.
   *
   * В починке он тоже есть. Раньше не было — и получался хардмод в самом
   * неподходящем месте: авария прилетает до сверки, чинить надо вслепую,
   * а единственный инструмент диагностики отбирают. Слежку там не поставить
   * (платить нечем — ходы не идут), остальное работает.
   */
  const hasTerminal = mode === 'shift' && shift !== null

  /** Терминал развёрнут на весь экран — на телефоне это единственный режим. */
  const [termFull, setTermFull] = useState(false)

  function openTerminal() {
    beep('tap')
    setTermOpen(true)
    if (termLines.length === 0) setTermLines(greeting(normalizeRepo(profile.repo).split('/')[0]))
  }

  /** Стереть след прошлого хода: терминал не помнит чужой PR. */
  function resetTerminal() {
    setTermOpen(false)
    setTermFull(false)
    setTermLines([])
    setBlamed(false)
    setWatching([])
  }

  function terminalRun(input: string) {
    if (!shift) return

    const result = runTerminal(input, {
      task: prTask,
      pr: prNumber,
      author: agent,
      dossier: profile.dossier,
      selected,
      watching,
      probes: shift.probes,
      blamed,
      // Слежка платит ходом смены, а в починке ходы не идут.
      canWatch: repairing === null,
    })

    setTermLines((prev) => [...prev, { tone: 'in', text: `$ ${input}` }, ...result.lines])
    beep('tap')

    for (const effect of result.effects) {
      if (effect.kind === 'clear') setTermLines([])
      if (effect.kind === 'probe') {
        const spent = probeShift(shift)
        setShift(spent)
        saveShift(spent)
      }
      // История поднимается раз за ход — иначе весь профиль агента
      // открывается за один раунд и собирать становится нечего.
      if (effect.kind === 'blamed') setBlamed(true)
      if (effect.kind === 'dossier') {
        const known = AGENTS[effect.agent].known.length
        const dossier = {
          ...profile.dossier,
          [effect.agent]: Math.min(known, (profile.dossier[effect.agent] ?? 0) + 1),
        }
        const full = Object.fromEntries(
          AGENT_SLUGS.map((slug) => [slug, AGENTS[slug].known.length]),
        )
        unlock(dossierUnlocks(dossier, full), { ...profile, dossier })
      }
      if (effect.kind === 'watch') releaseToLogging(effect.lines)
    }
  }

  /**
   * Отпустить PR на логирование.
   *
   * Схема ровно одна и без развилок: лог → экран «виртуальный тик прода»
   * с оперативным отчётом → тот же самый PR, сразу на дифе. Ход потрачен,
   * решение по PR никуда не делось, и PR не теряется — раньше он мог
   * разъехаться между алертом, сверкой и брифингом, и было непонятно,
   * что вообще происходит.
   */
  function releaseToLogging(lines: number[]) {
    if (!shift) return

    const turn = watchTurn(shift, task, lines, watchCaught(task, lines), elapsed.current)
    setShift(turn.shift)
    setFired(turn.fired)
    saveShift(turn.shift)
    setWatching(lines)

    beep('stamp')
    setScreen('tick')
  }

  /**
   * Вернуться к PR с логирования. Брифинг не повторяем: PR тот же самый,
   * читать про него заново нечего — сразу диф и отчёт в терминале.
   */
  function backFromTick() {
    if (!shift) return
    beep('tap')
    if (!resumeWatched(shift)) nextTurn(shift)
  }

  /**
   * Отдать игроку PR, который лежал на логировании. false — на логировании
   * ничего нет, ход обычный.
   */
  function resumeWatched(current: Shift): boolean {
    const back = current.pending
    const returning = back ? POOL.find((t) => t.id === back.task) : undefined
    if (!back || !returning) return false

    resetRound()
    setWatching(back.lines)
    setBlamed(false)
    setTask(returning)
    setTermLines([
      ...greeting(normalizeRepo(profile.repo).split('/')[0]),
      ...report(returning, back.lines),
    ])
    setTermOpen(true)
    // Строки за игрока не отмечаем, даже если лог сел на подлянку. Раньше
    // отмечали — и слежка становилась не наблюдением, а покупкой ответа:
    // повесил лог на полфайла, получил готовую разметку.
    setScreen('review')
    return true
  }

  function pickLine(line: number) {
    if (screen !== 'review') return
    beep(selected.includes(line) ? 'deselect' : 'select')
    setSelected((s) => (s.includes(line) ? s.filter((l) => l !== line) : [...s, line]))
  }

  /**
   * Сохранить разметку PR и вернуться к списку.
   *
   * Ничего не считает и ничего не ломает. Пересчёт — один, на выходе
   * из починки: игрок должен иметь право передумать, не платя за каждую
   * версию здоровьем прода.
   */
  function saveDraft() {
    if (!repairing) return

    beep('stamp')
    setDrafts((prev) => {
      const next = new Map(prev)
      if (selected.length === 0) next.delete(repairing.pr)
      else next.set(repairing.pr, [...selected].sort((a, b) => a - b))
      return next
    })
    setRepairing(null)
    resetRound()
    resetTerminal()
    setScreen('repair')
  }

  /**
   * Выкатить все черновики разом.
   *
   * Порядок — по номеру PR, чтобы результат не зависел от того, в каком
   * порядке игрок их открывал. Каждая правка идёт через тот же разбор
   * отправки, что и обычное ревью: чинить и ревьюить — одно действие.
   */
  function applyDrafts(current: Shift): { shift: Shift; fired: Defect[] } {
    let live = current
    const blown: Defect[] = []

    for (const [pr, lines] of [...drafts].sort((a, b) => a[0] - b[0])) {
      const event = merged(current, current.turns).find((e) => e.kind === 'merged' && e.pr === pr)
      const found = event && 'task' in event ? POOL.find((t) => t.id === event.task) : undefined
      if (!found || lines.length === 0) continue

      const result = resolveSubmit(found, lines, MAX_ATTEMPTS - 1)
      if (result.kind !== 'finish') continue

      const turn = repairShift(live, pr, found, result.outcome)
      live = turn.shift
      blown.push(...turn.fired)
      setTried((prev) => new Map(prev).set(pr, (prev.get(pr) ?? 0) + 1))
    }

    setDrafts(new Map())
    return { shift: live, fired: blown }
  }

  function startRepair(pr: number, taskId: string) {
    const found = POOL.find((t) => t.id === taskId)
    if (!found) return

    beep('tap')
    // Закрытый своими руками PR открывается не на починку, а на просмотр:
    // там уже нечего искать, зато видно, что именно было переписано.
    if (fixedPrs.has(pr)) {
      setPostmortem({ task: found, pr, back: 'repair' })
      setScreen('postmortem')
      return
    }

    resetRound()
    // Черновик этого PR возвращается на экран: игрок пришёл его править,
    // а не размечать с нуля.
    setSelected(drafts.get(pr) ?? [])
    // Плюс от прошлой уборки гасим: пока игрок чинит, здоровье изменится,
    // и висящий рядом «+5» станет неправдой.
    setHealed(null)
    setRepairing({ pr, task: found })
    setScreen('review')
  }

  /**
   * ИИ отвечает на обвинение — и отвечает одинаково подобострастно, прав игрок
   * или нет. Поэтому реплику видно и в слепой смене: она не подсказывает
   * ничего, кроме того, что агенту всё равно.
   */
  function sayReply(seed: string) {
    setReply({ agent: agent.slug, line: replyTo(agent, seed) })
    setTimeout(() => setReply(null), 3600)
  }

  function submit() {
    if (screen !== 'review') return
    if (selected.length > 0) sayReply(`${task.id}:${attempts}:${selected.join(',')}`)
    if (repairing) {
      saveDraft()
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
                : // Прод сгорел — начинаем с чистого, но день не сбрасываем:
                  // это тот же репозиторий и та же рабочая неделя.
                  { prod: PROD_START, defects: [], pr: saved.pr, day: saved.day }
              : undefined,
          )

    endlessSeed.current = `shift:${today}:${next.pr}`
    setMode('shift')
    setSeries([])
    setShift(next)
    setFired([])
    saveShift(next)
    resetRun()
    resetTerminal()
    setCheckpoint(false)
    setUrgent(false)
    // Через advanceTurn, а не напрямую: у продолженной смены мог остаться PR
    // на логировании, и его надо вернуть игроку, а не подменить новым.
    advanceTurn(next)
  }

  /** Следующий ход смены — либо конец, если прод или ходы кончились. */
  function nextTurn(current: Shift) {
    if (isShiftOver(current)) {
      beep('win')
      setScreen('shift-end')
      return
    }

    // Каждые четыре хода игрока выпускают посмотреть на прод. Правды там нет:
    // здоровье, отклик и список своих мёрджей — и всё.
    //
    // Сверка привязана к номеру хода, а не к пути, которым до него дошли:
    // авария ровно на четвёртом ходу больше её не съедает, а повторно
    // на том же ходу она не открывается.
    if (isCheckpoint(current) && checkedAt !== current.turn) {
      beep('toggle')
      setCheckedAt(current.turn)
      setUrgent(false)
      setCheckpoint(true)
      setScreen('repair')
      return
    }

    advanceTurn(current)
  }

  /** Собственно новый ход: чекпойнт уже пройден либо его не было. */
  function advanceTurn(current: Shift) {
    const i = current.turn
    setIndex(i)
    resetRound()

    // На логировании мог остаться PR — например, смену продолжили после
    // перезагрузки вкладки. Тогда сначала он, а не новый.
    if (resumeWatched(current)) return

    resetTerminal()
    setTask(
      pickShift(
        shiftPool,
        endlessSeed.current,
        i,
        history.slice(-5).map((h) => h.task.id),
        hands,
      ),
    )
    setScreen('briefing')
  }

  /** Уборка: тратит заряд, не ход. Экран остаётся тот же, что и был. */
  function doCleanup() {
    if (!shift || shift.cleanups <= 0) return

    const turn = cleanupTurn(shift)
    // Разгребать было нечего — заряд остался, и сказать об этом надо словами,
    // иначе кнопка выглядит сломанной.
    if (!turn.done) {
      beep('bad')
      setHealed(0)
      return
    }

    beep('toggle')
    setShift(turn.shift)
    saveShift(turn.shift)
    // Плюс здоровья показываем цифрой: без неё кнопка выглядит мёртвой.
    setHealed(Math.round((turn.shift.prod.health - shift.prod.health) * 10) / 10)
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
   * Оставить аварию и работать дальше. Прод при этом продолжит падать каждый
   * ход — это осознанный выбор игрока, а не бесплатное «дальше».
   */
  function afterIncident() {
    beep('tap')
    const rest = fired.slice(1)
    setFired(rest)
    if (rest.length > 0 || !shift) return

    if (!isShiftOver(shift)) nextTurn(shift)
    else setScreen(finishShift(shift).verdict === 'alive' ? 'repair' : 'shift-end')
  }

  /**
   * Чинить прямо сейчас: прод лежит, время и попытки не считаются.
   * Список аварий не сбрасываем — с экрана починки к нему можно вернуться.
   */
  function repairNow() {
    beep('tap')
    setHealed(null)
    setUrgent(true)
    setScreen('repair')
  }

  /** Вернуться из починки к разбору аварии: раньше это был выход без выхода. */
  function backToIncident() {
    beep('tap')
    setUrgent(false)
    setScreen('incident')
  }

  /**
   * Выйти из разбора. Здесь и только здесь считаются черновики правок:
   * игрок сказал «хватит», значит правки уезжают в прод разом.
   */
  function leaveRepair() {
    if (!shift) {
      startShift(true)
      return
    }

    beep('tap')
    const applied = applyDrafts(shift)
    setShift(applied.shift)
    saveShift(applied.shift)
    setHealed(null)
    setCheckpoint(false)
    setUrgent(false)

    // Правки могли добить прод — или, наоборот, дотикать соседнюю мину.
    if (applied.fired.length > 0) {
      setFired(applied.fired)
      setScreen('incident')
      return
    }

    if (finishShift(applied.shift).verdict !== 'alive') {
      setScreen('shift-end')
      return
    }

    // Смена доиграна — это разбор завалов, отсюда путь только на новую.
    if (isShiftOver(applied.shift)) {
      startShift(true)
      return
    }

    setFired([])
    // Через nextTurn, а не сразу в новый ход: если сверка на этом ходу ещё
    // не показывалась, её очередь именно сейчас. Повторно она не откроется —
    // за этим следит `checkedAt`.
    nextTurn(applied.shift)
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
        onAch={() => {
          beep('tap')
          setPrevScreen(screen)
          setScreen('ach')
        }}
        onSettings={() => {
          beep('tap')
          setSettingsOpen(true)
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
                // В смене очки — это ответ: набежавший счётчик говорит,
                // что раунд удался. Их показывают в отчёте, не раньше.
                total: mode === 'shift' ? null : runningTotal,
                endless: mode === 'endless',
                lives: ENDLESS_LIVES - missed,
                maxLives: ENDLESS_LIVES,
                prod:
                  mode === 'shift' && shift
                    ? { ...shift.prod, delta: shift.delta, state: prodState(shift.defects) }
                    : null,
                onExit: goHome,
              }
            : null
        }
      />

      {/* Имя репозитория спрашивают один раз в жизни и до всего остального:
          это начало игры, а не пункт настроек. */}
      {!profile.repoAsked && (
        <RepoSetup
          accent={accent}
          onDone={(next) => {
            beep('start')
            keep({ ...profile, repo: next, repoAsked: true })
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          accent={accent}
          sound={profile.sound}
          typing={profile.typing}
          music={profile.music}
          musicOn={profile.musicOn}
          track={track}
          termInput={profile.termInput}
          onSound={(on) => {
            setSoundEnabled(on)
            keep({ ...profile, sound: on })
            if (on) setTimeout(() => beep('toggle'), 30)
          }}
          onTyping={(on) => {
            setTypingEnabled(on)
            keep({ ...profile, typing: on })
            if (on) setTimeout(() => beep('key'), 30)
          }}
          // Ползунок дёргается непрерывно — в localStorage пишем то же, что
          // видит игрок: значений мало, и терять их на перезагрузке обиднее.
          onMusic={(music) => keep({ ...profile, music })}
          onMusicToggle={(on) => keep({ ...profile, musicOn: on })}
          onNextTrack={() => {
            beep('tap')
            nextTrack()
          }}
          onTermInput={(termInput) => {
            beep('toggle')
            keep({ ...profile, termInput })
          }}
          onClose={() => {
            beep('tap')
            setSettingsOpen(false)
          }}
        />
      )}

      {toastAchievement && <Toast achievement={toastAchievement} accent={accent} />}
      {reply && !toastAchievement && (
        <Reply
          agent={AGENTS[reply.agent]}
          line={reply.line}
          anonymous={anonymous}
          accent={accent}
        />
      )}

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
            // Стек спрашиваем только у новой смены. Незаконченную и разбор
            // завалов продолжаем сразу: стек у них уже выбран.
            onShift={() =>
              shift && finishShift(shift).verdict === 'alive'
                ? withRules(() => startShift())
                : openSetup('shift')
            }
            shift={
              shift && {
                health: shift.prod.health,
                turn: shift.turn,
                turns: shift.turns,
                day: shift.day,
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

        {screen === 'briefing' && (
          <Briefing
            task={task}
            agent={agent}
            pr={pr}
            line={briefLine(agent, index)}
            seconds={duration}
            accent={accent}
            anonymous={anonymous}
            note={
              mode === 'shift'
                ? 'баги в проде чинят руками — на падении или после смены'
                : undefined
            }
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
            stopwatch={mode === 'shift' && !repairing ? stopwatch : null}
            note={authorNote}
            probes={hasTerminal ? shift.probes : null}
            onTerminal={hasTerminal ? openTerminal : null}
            terminalFull={termFull}
            terminal={
              hasTerminal && termOpen ? (
                <Terminal
                  host={normalizeRepo(profile.repo).split('/')[0]}
                  lines={termLines}
                  accent={accent}
                  probes={shift.probes}
                  input={profile.termInput}
                  canWatch={repairing === null}
                  full={termFull}
                  onFull={(next) => {
                    beep('tap')
                    setTermFull(next)
                  }}
                  onRun={terminalRun}
                  onClose={() => {
                    beep('tap')
                    setTermFull(false)
                    setTermOpen(false)
                  }}
                />
              ) : null
            }
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
            // Мина, которая уже падала на прошлом ходу, падает не впервые.
            again={shift.log.filter((e) => e.kind === 'incident' && e.pr === fired[0].pr).length > 1}
            total={fired.length}
            accent={accent}
            onRepair={repairNow}
            onNext={afterIncident}
          />
        )}

        {screen === 'tick' && shift?.pending && (
          <Tick
            pr={shift.pending.pr}
            lines={report(task, shift.pending.lines)}
            hit={shift.pending.hit}
            delta={shift.delta}
            incidents={fired.length}
            accent={accent}
            onBack={backFromTick}
          />
        )}

        {screen === 'repair' && shift && (
          <RepairPick
            merged={merged(shift, shift.turns)}
            titles={TITLES}
            diffs={DIFFS}
            fixed={fixedPrs}
            tried={tried}
            drafts={drafts}
            prod={{ ...shift.prod, delta: shift.delta, state: prodState(shift.defects) }}
            healed={healed}
            accent={accent}
            urgent={urgent}
            checkpoint={
              checkpoint
                ? {
                    turn: shift.turn,
                    turns: shift.turns,
                    day: shift.day,
                    slowdown: slowdown(shift.defects),
                  }
                : null
            }
            cleanups={shift.cleanups}
            onPick={startRepair}
            onCleanup={doCleanup}
            onDone={leaveRepair}
            onBackToIncident={fired.length > 0 ? backToIncident : null}
            onExit={goHome}
          />
        )}

        {screen === 'postmortem' && postmortem && shift && (
          <Postmortem
            task={postmortem.task}
            tokens={undefined}
            pr={postmortem.pr}
            events={shift.log.filter((e) => 'pr' in e && e.pr === postmortem.pr)}
            fixed={fixedPrs.has(postmortem.pr)}
            byCleanup={cleanedPrs.has(postmortem.pr)}
            accent={accent}
            onBack={() => {
              beep('tap')
              setScreen(postmortem.back)
              setPostmortem(null)
            }}
          />
        )}

        {screen === 'shift-end' && shift && (
          <ShiftEnd
            summary={finishShift(shift)}
            log={shift.log}
            turns={shift.turn}
            day={shift.day}
            spent={shift.spent}
            accent={accent}
            titles={TITLES}
            // Правду показываем, только когда игра кончилась: пока прод жив,
            // разбор превратил бы слепую починку в чтение ответов.
            reveal={finishShift(shift).verdict !== 'alive'}
            onOpen={
              finishShift(shift).verdict !== 'alive'
                ? (pr, taskId) => {
                    const found = POOL.find((t) => t.id === taskId)
                    if (!found) return
                    beep('tap')
                    setPostmortem({ task: found, pr, back: 'shift-end' })
                    setScreen('postmortem')
                  }
                : null
            }
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
