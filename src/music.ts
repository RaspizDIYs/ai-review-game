/**
 * Фоновая музыка.
 *
 * Щелчки кнопок игра синтезирует на лету (см. sound.ts), но тему на фон
 * синтезом не сделаешь — здесь готовые треки. Играет один <audio>: он умеет
 * стримить, и мегабайты не висят в памяти целиком, как это было бы
 * с WebAudio-буфером.
 *
 * Плейлистов два, и это не украшение:
 *
 * - **меню** — заглавная тема и только она. Главный экран должен звучать
 *   одинаково каждый раз: это лицо игры, а не случайный трек из мешка;
 * - **игра** — всё остальное, в перемешанном порядке. Порядок тасуется при
 *   каждом заходе в режим, поэтому смена и челлендж не звучат одной песней.
 *
 * У трека есть своя громкость (`gain`): «The Junior's Panic» — песня
 * с вокалом, и на общей громкости она перекрикивает инструментальные.
 *
 * Браузер не даст ничего запустить до первого касания страницы, поэтому
 * автостарт висит на первом же клике или нажатии клавиши и снимается сам.
 */

export interface Track {
  file: string
  title: string
  /** Множитель к общей громкости. 1 — как все. */
  gain: number
}

/** Заглавная тема: всегда и только на главном экране. */
export const THEME: Track = {
  file: 'echoes-of-tomorrow.mp3',
  title: 'Echoes of Tomorrow',
  gain: 1,
}

/** Мешок для режимов игры. Порядок задаётся тасовкой на входе в режим. */
export const GAME_TRACKS: Track[] = [
  { file: 'neon-horizon.mp3', title: 'Neon Horizon', gain: 1 },
  { file: 'neon-horizon-2.mp3', title: 'Neon Horizon II', gain: 1 },
  { file: 'cold-stack.mp3', title: 'Cold Stack', gain: 1 },
  { file: 'glass-server-bloom.mp3', title: 'Glass Server Bloom', gain: 1 },
  // Единственная песня в наборе — на общей громкости она забивает остальное.
  { file: "juniors-panic.mp3", title: "The Junior's Panic", gain: 0.62 },
]

export const TRACKS: Track[] = [THEME, ...GAME_TRACKS]

export type Playlist = 'menu' | 'game'

/** Громкость по умолчанию — она же та, к которой возвращает кнопка звука. */
export const DEFAULT_MUSIC = 0.35

/** Секунды плавного входа: резко включившаяся музыка звучит как ошибка. */
const FADE = 1.6
const STEP = 60

let el: HTMLAudioElement | null = null
/** Что сейчас в очереди: в меню — одна тема, в игре — перетасованный мешок. */
let queue: Track[] = [THEME]
let index = 0
let playlist: Playlist = 'menu'
let volume = DEFAULT_MUSIC
let enabled = false
/** Первое касание страницы уже было — до него play() всё равно отклоняется. */
let armed = false
let fade: number | null = null
const listeners = new Set<(track: Track | null) => void>()

function current(): Track {
  return queue[index] ?? THEME
}

/** Целевая громкость с учётом собственного веса трека. */
function target(): number {
  return Math.min(1, Math.max(0, volume * current().gain))
}

function announce(): void {
  const track = el && !el.paused ? current() : null
  for (const fn of listeners) fn(track)
}

/** Подписка на смену трека — плеер в шапке показывает, что сейчас играет. */
export function onMusicTrack(fn: (track: Track | null) => void): () => void {
  listeners.add(fn)
  fn(el && !el.paused ? current() : null)
  return () => listeners.delete(fn)
}

function element(): HTMLAudioElement {
  if (el) return el

  el = new Audio()
  el.preload = 'none'
  el.volume = 0
  // Луп делаем руками: треков несколько, и следующий должен когда-нибудь заиграть.
  el.addEventListener('ended', () => {
    advance()
    load()
    void play()
  })
  load()
  return el
}

function load(): void {
  if (!el) return
  el.src = `${import.meta.env.BASE_URL}music/${current().file}`
}

/** Следующий в очереди. Меню зациклено на теме, игра идёт по кругу мешка. */
function advance(): void {
  index = (index + 1) % queue.length
}

/**
 * Перетасовать мешок. Порядок случайный, но первый трек не повторяет тот,
 * что только что играл: два одинаковых захода подряд читаются как «музыка
 * не переключилась».
 */
function shuffle(previous: Track | null): Track[] {
  const bag = [...GAME_TRACKS]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  if (bag.length > 1 && previous && bag[0].file === previous.file) {
    ;[bag[0], bag[1]] = [bag[1], bag[0]]
  }
  return bag
}

/** Плавно ведём громкость к цели; 0 в конце — это пауза, а не тихий звук. */
function ramp(to: number, seconds: number, then?: () => void): void {
  const node = element()
  if (fade !== null) clearInterval(fade)

  const from = node.volume
  const steps = Math.max(1, Math.round((seconds * 1000) / STEP))
  let i = 0

  fade = window.setInterval(() => {
    i++
    const v = from + (to - from) * (i / steps)
    node.volume = Math.min(1, Math.max(0, v))
    if (i < steps) return

    clearInterval(fade!)
    fade = null
    then?.()
  }, STEP)
}

async function play(): Promise<void> {
  const node = element()
  try {
    await node.play()
    ramp(target(), FADE)
    announce()
  } catch {
    // Автоплей ещё не разрешён — попробуем на следующем касании.
  }
}

function stop(): void {
  const node = element()
  ramp(0, FADE / 2, () => {
    node.pause()
    announce()
  })
}

/** Обновить состояние плеера под текущие настройки. */
function sync(): void {
  if (!armed) return

  const node = element()
  if (enabled && volume > 0) {
    if (node.paused) void play()
    else ramp(target(), 0.25)
    return
  }

  if (!node.paused) stop()
}

/**
 * Переключить плейлист. Меню — заглавная тема, игра — перетасованный мешок.
 * Повторный вызов с тем же плейлистом ничего не делает: заходить на главную
 * из подэкрана не должно перезапускать тему с начала.
 */
export function setPlaylist(next: Playlist): void {
  if (next === playlist && el !== null) return

  const previous = playlist === 'game' ? current() : null
  playlist = next
  queue = next === 'menu' ? [THEME] : shuffle(previous)
  index = 0

  const node = element()
  const was = !node.paused
  load()
  if (was || (armed && enabled && volume > 0)) void play()
  else announce()
}

export function setMusicVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v))
  sync()
}

export function setMusicEnabled(on: boolean): void {
  enabled = on
  sync()
}

/**
 * Разрешить музыку после первого касания страницы. Вешается один раз из App;
 * до этого момента play() у браузера всё равно не проходит.
 */
export function armMusic(): () => void {
  const go = () => {
    if (armed) return
    armed = true
    sync()
  }

  // capture: клики по кнопкам останавливают всплытие — жест мы бы не увидели.
  const opts = { capture: true, passive: true } as const
  window.addEventListener('pointerdown', go, opts)
  window.addEventListener('keydown', go, opts)

  return () => {
    window.removeEventListener('pointerdown', go, opts)
    window.removeEventListener('keydown', go, opts)
  }
}

/**
 * Следующий трек — по кнопке в плеере. На главной переключать нечего:
 * там играет заглавная тема, и другой у главного экрана нет.
 */
export function nextTrack(): void {
  if (queue.length < 2) {
    announce()
    return
  }
  advance()
  load()
  if (armed && enabled && volume > 0) void play()
  else announce()
}
