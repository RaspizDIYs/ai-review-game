/**
 * Фоновая музыка.
 *
 * Щелчки кнопок игра синтезирует на лету (см. sound.ts), но тему на фон
 * синтезом не сделаешь — здесь два готовых трека, которые крутятся по кругу.
 * Играет один <audio>: он умеет стримить, и мегабайты не висят в памяти
 * целиком, как это было бы с WebAudio-буфером.
 *
 * Браузер не даст ничего запустить до первого касания страницы, поэтому
 * автостарт висит на первом же клике или нажатии клавиши и снимается сам.
 */

export interface Track {
  file: string
  title: string
}

export const TRACKS: Track[] = [
  { file: 'cold-stack.mp3', title: 'Cold Stack' },
  { file: 'glass-server-bloom.mp3', title: 'Glass Server Bloom' },
]

/** Громкость по умолчанию — она же та, к которой возвращает кнопка звука. */
export const DEFAULT_MUSIC = 0.35

/** Секунды плавного входа: резко включившаяся музыка звучит как ошибка. */
const FADE = 1.6
const STEP = 60

let el: HTMLAudioElement | null = null
let index = 0
let volume = DEFAULT_MUSIC
let enabled = false
/** Первое касание страницы уже было — до него play() всё равно отклоняется. */
let armed = false
let fade: number | null = null
const listeners = new Set<(track: Track | null) => void>()

function announce(): void {
  const track = el && !el.paused ? TRACKS[index] : null
  for (const fn of listeners) fn(track)
}

/** Подписка на смену трека — плеер в шапке показывает, что сейчас играет. */
export function onMusicTrack(fn: (track: Track | null) => void): () => void {
  listeners.add(fn)
  fn(el && !el.paused ? TRACKS[index] : null)
  return () => listeners.delete(fn)
}

function element(): HTMLAudioElement {
  if (el) return el

  el = new Audio()
  el.preload = 'none'
  el.volume = 0
  // Луп делаем руками: трека два, и второй должен когда-нибудь заиграть.
  el.addEventListener('ended', () => {
    index = (index + 1) % TRACKS.length
    load()
    void play()
  })
  load()
  return el
}

function load(): void {
  if (!el) return
  el.src = `${import.meta.env.BASE_URL}music/${TRACKS[index].file}`
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
    ramp(volume, FADE)
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
    else ramp(volume, 0.25)
    return
  }

  if (!node.paused) stop()
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

/** Следующий трек — по кнопке в плеере. */
export function nextTrack(): void {
  index = (index + 1) % TRACKS.length
  load()
  if (armed && enabled && volume > 0) void play()
  else announce()
}
