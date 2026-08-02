/**
 * Прогресс в localStorage. Бэкенда нет и не планируется в MVP,
 * см. заметку «Бэкенда в MVP нет».
 */

import type { LevelId } from './levels'
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
  settings: Settings | null
  /** Полученные ачивки — id из ACHIEVEMENTS. */
  unlocked: string[]
  /** Опыт за всё время: из него считается ранг. */
  lifetime: number
  sound: boolean
  /** Агент, выбранный на главной — просто чтобы экран был свой. */
  hero: string
}

const EMPTY: Save = {
  v: 1,
  daily: {},
  bestEndless: 0,
  streakCurrent: 0,
  streakLastDay: null,
  onboarded: false,
  progress: null,
  settings: null,
  unlocked: [],
  lifetime: 0,
  sound: true,
  hero: 'commander',
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

  return saved && stacks.length > 0 ? { ...saved, stacks } : fallback
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

/** Профиль игрока: то, что переживает серию. */
export interface Profile {
  unlocked: string[]
  lifetime: number
  sound: boolean
  hero: string
}

export function getProfile(): Profile {
  const { unlocked, lifetime, sound, hero } = read()
  return { unlocked, lifetime, sound, hero }
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
