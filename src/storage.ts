/**
 * Прогресс в localStorage. Бэкенда нет и не планируется в MVP,
 * см. заметку «Бэкенда в MVP нет».
 */

import type { LevelId } from './levels'
import { DEFAULT_MUSIC } from './music.ts'
import { DEFAULT_SHIFT_STACK, type ShiftStack } from './stacks.ts'
import type { Outcome, Stack } from './types'

const KEY = 'review-after-ai:v1'

export interface DailyRecord {
  /** По одному на раунд, в порядке серии. */
  outcomes: Outcome[]
  score: number
  /** Суммарно секунд на всю серию. */
  seconds: number
}

/**
 * Незаконченная серия дня. Пишется после каждого вердикта, чтобы упавшая
 * вкладка не съедала единственный за день заход — и чтобы его нельзя было
 * начать заново, обновив страницу.
 */
export interface RunProgress {
  day: string
  /** Номер последнего сыгранного раунда. */
  index: number
  taskIds: string[]
  outcomes: Outcome[]
  scores: number[]
  /** Пропущенных подлянок — от них усталость следующего раунда. */
  missed: number
  seconds: number
}

/**
 * Настройка своей подборки. Уровень — потолок сложности, языки — что вообще
 * может выпасть. Счётчик сыгранных подборок входит в сид: без него «собрать
 * ещё одну» отдавало бы ту же тройку, потому что всё остальное не менялось.
 */
export interface Settings {
  level: LevelId
  stacks: Stack[]
  played: number
  /** Свой стек для смены — фронт, бэкенд и пайплайн. Уровень там не при чём. */
  shiftStack: ShiftStack
}

interface Save {
  v: 1
  daily: Record<string, DailyRecord>
  bestEndless: number
  streakCurrent: number
  streakLastDay: string | null
  /** Подсказку первого раунда показываем ровно один раз за всю жизнь. */
  onboarded: boolean
  progress: RunProgress | null
  /**
   * Смена: незаконченная — чтобы продолжить, законченная — чтобы следующая
   * приняла прод. Лежит как есть и проверяется на входе `restore` из
   * `shift.ts`: схема тут своя, и знать её хранилищу незачем.
   */
  shift: unknown
  settings: Settings | null
  /** Полученные ачивки — id из ACHIEVEMENTS. */
  unlocked: string[]
  /** Опыт за всё время: из него считается ранг. */
  lifetime: number
  /** Пойманных подлянок за всё время — от него ачивки на пробег. */
  found: number
  sound: boolean
  /** Стук клавиш в терминале. Отдельный тумблер: щелчки интерфейса редкие,
   *  а печать — это поток, и выключать её хотят отдельно. */
  typing: boolean
  /** Как игрок вводит команды терминала. */
  termInput: TermInput
  /** Громкость фоновой темы, 0..1. Отдельно от выключателя: выключив музыку
   *  и включив обратно, игрок ждёт ту же громкость, что и была. */
  music: number
  musicOn: boolean
  /** Агент, выбранный на главной — просто чтобы экран был свой. */
  hero: string
  /**
   * Сколько строк досье собрано по каждому агенту. Копится через `/git-blame`
   * и живёт между сменами: знание о почерке — это и есть прогресс игрока
   * в расследовании.
   */
  dossier: Record<string, number>
  /** Имя репозитория в шапке. Пусто — подставится значение по умолчанию. */
  repo: string
  /**
   * Игрок уже видел окно «как называется твой репозиторий». Показывается один
   * раз за жизнь: имя репозитория — это начало игры, а не настройка, которую
   * предлагают каждый заход.
   */
  repoAsked: boolean
}

const EMPTY: Save = {
  v: 1,
  daily: {},
  bestEndless: 0,
  streakCurrent: 0,
  streakLastDay: null,
  onboarded: false,
  progress: null,
  shift: null,
  settings: null,
  unlocked: [],
  lifetime: 0,
  found: 0,
  sound: true,
  typing: true,
  termInput: 'both',
  music: DEFAULT_MUSIC,
  musicOn: true,
  hero: 'commander',
  dossier: {},
  repo: '',
  repoAsked: false,
}

function read(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw)
    // Схему меняем — старое просто выбрасываем: это игровой прогресс,
    // а не данные, ради которых стоит писать миграции.
    if (parsed?.v !== 1) return { ...EMPTY }
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

function write(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Приватный режим или переполненное хранилище — играть это не мешает.
  }
}

export function getDaily(day: string): DailyRecord | null {
  return read().daily[day] ?? null
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10)
}

/** Незаконченная серия за сегодня. Вчерашнюю не отдаём: она уже не доиграется. */
export function getProgress(today: string): RunProgress | null {
  const p = read().progress
  return p && p.day === today ? p : null
}

export function saveProgress(progress: RunProgress): void {
  write({ ...read(), progress })
}

export function clearProgress(): void {
  write({ ...read(), progress: null })
}

/** Сырая смена: разбирать её — дело `shift.ts`, а не хранилища. */
export function getShift(): unknown {
  return read().shift
}

export function saveShift(shift: unknown): void {
  write({ ...read(), shift })
}

export function saveDaily(day: string, record: DailyRecord): void {
  const save = read()
  save.progress = null // серия доиграна, продолжать больше нечего
  if (save.daily[day]) {
    write(save)
    return // один заход в день, переписывать нечего
  }

  save.daily[day] = record
  save.streakCurrent = save.streakLastDay === previousDay(day) ? save.streakCurrent + 1 : 1
  save.streakLastDay = day
  write(save)
}

export function getStreak(today: string): number {
  const save = read()
  if (!save.streakLastDay) return 0
  // Серия жива, только если последний заход был сегодня или вчера.
  if (save.streakLastDay === today || save.streakLastDay === previousDay(today)) {
    return save.streakCurrent
  }
  return 0
}

export function getSettings(fallback: Settings): Settings {
  const saved = read().settings
  // Язык мог исчезнуть из пака между версиями — сохранённый выбор не должен
  // оставлять игрока с пустой подборкой и без объяснений.
  const stacks = saved?.stacks.filter((s) => fallback.stacks.includes(s)) ?? []

  // Свой стек мог не сохраниться вовсе — до смены его в настройках не было.
  const shiftStack = saved?.shiftStack ?? DEFAULT_SHIFT_STACK

  return saved && stacks.length > 0 ? { ...saved, stacks, shiftStack } : fallback
}

export function saveSettings(settings: Settings): void {
  write({ ...read(), settings })
}

export function isOnboarded(): boolean {
  return read().onboarded
}

export function markOnboarded(): void {
  write({ ...read(), onboarded: true })
}

/**
 * Как игрок вводит команды терминала: печатает руками, жмёт кнопки или и то,
 * и другое. На телефоне набирать команды пальцем мучительно, а на
 * клавиатуре кнопки только мешают — поэтому это настройка, а не выбор за игрока.
 */
export type TermInput = 'type' | 'buttons' | 'both'

/** Профиль игрока: то, что переживает серию. */
export interface Profile {
  unlocked: string[]
  lifetime: number
  found: number
  sound: boolean
  typing: boolean
  termInput: TermInput
  music: number
  musicOn: boolean
  hero: string
  dossier: Record<string, number>
  repo: string
  repoAsked: boolean
}

export function getProfile(): Profile {
  const s = read()
  return {
    unlocked: s.unlocked,
    lifetime: s.lifetime,
    found: s.found,
    sound: s.sound,
    typing: s.typing,
    termInput: s.termInput,
    music: s.music,
    musicOn: s.musicOn,
    hero: s.hero,
    dossier: s.dossier,
    repo: s.repo,
    repoAsked: s.repoAsked,
  }
}

export function saveProfile(profile: Profile): void {
  write({ ...read(), ...profile })
}

export function getBestEndless(): number {
  return read().bestEndless
}

export function saveEndless(score: number): boolean {
  const save = read()
  if (score <= save.bestEndless) return false
  save.bestEndless = score
  write(save)
  return true
}
