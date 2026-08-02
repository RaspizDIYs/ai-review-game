/**
 * Звук без единого файла: мягкие маримба-подобные тона на пентатонике,
 * собранные на WebAudio. Так игра остаётся статикой, которую можно положить
 * на диск, и не платит мегабайтом за три щелчка.
 *
 * Контекст создаётся при первом звуке, а не при загрузке: браузер всё равно
 * не даст его запустить до первого касания.
 */

export type Cue =
  | 'tap'
  | 'toggle'
  | 'select'
  | 'deselect'
  | 'swipe'
  | 'start'
  | 'ok'
  | 'bad'
  | 'stamp'
  | 'win'

const N = {
  F3: 174.6,
  A3: 220,
  D4: 293.66,
  F4: 349.23,
  A4: 440,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.7,
  E6: 1318.5,
  G6: 1568,
}

/** [частота, задержка, длительность, громкость, форма волны] */
type Note = [number, number, number, number, OscillatorType?]

const SEQ: Record<Cue, Note[]> = {
  tap: [[N.A5, 0, 0.14, 0.075]],
  toggle: [
    [N.E5, 0, 0.13, 0.07],
    [N.A5, 0.055, 0.18, 0.06],
  ],
  select: [
    [N.E5, 0, 0.12, 0.075],
    [N.C6, 0.05, 0.2, 0.06],
  ],
  deselect: [
    [N.C6, 0, 0.1, 0.055],
    [N.E5, 0.05, 0.16, 0.05],
  ],
  swipe: [[N.D6, 0, 0.11, 0.05]],
  start: [
    [N.C5, 0, 0.18, 0.075],
    [N.G5, 0.075, 0.18, 0.07],
    [N.C6, 0.15, 0.34, 0.075],
  ],
  ok: [
    [N.G5, 0, 0.16, 0.085],
    [N.C6, 0.07, 0.18, 0.08],
    [N.E6, 0.14, 0.42, 0.075],
  ],
  bad: [
    [N.F4, 0, 0.2, 0.075, 'triangle'],
    [N.D4, 0.09, 0.34, 0.065, 'triangle'],
  ],
  stamp: [[N.A3, 0, 0.16, 0.06, 'triangle']],
  win: [
    [N.C5, 0, 0.2, 0.08],
    [N.E5, 0.09, 0.2, 0.08],
    [N.G5, 0.18, 0.22, 0.08],
    [N.C6, 0.27, 0.5, 0.085],
    [N.G6, 0.36, 0.6, 0.05],
  ],
}

let ctx: AudioContext | null = null
let bus: GainNode | null = null
let enabled = true

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

function audio(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null

    ctx = new AC()
    bus = ctx.createGain()
    bus.gain.value = 0.5

    // Срезаем верх: без фильтра синус на киловатт звучит как будильник.
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    lp.Q.value = 0.4

    bus.connect(lp)
    lp.connect(ctx.destination)
  }

  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Одна нота: синус плюс тихая октава сверху, мягкая атака и длинный хвост. */
function note(ac: AudioContext, out: GainNode, n: Note): void {
  const [freq, at, dur, vol, wave] = n
  const t = ac.currentTime + at

  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(out)

  const o = ac.createOscillator()
  o.type = wave ?? 'sine'
  o.frequency.setValueAtTime(freq, t)
  o.connect(g)
  o.start(t)
  o.stop(t + dur + 0.04)

  const h = ac.createOscillator()
  const hg = ac.createGain()
  h.type = 'sine'
  h.frequency.setValueAtTime(freq * 2, t)
  hg.gain.setValueAtTime(0.0001, t)
  hg.gain.exponentialRampToValueAtTime(vol * 0.22, t + 0.01)
  hg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.55)
  h.connect(hg)
  hg.connect(out)
  h.start(t)
  h.stop(t + dur + 0.04)
}

/** Звук никогда не должен мешать играть — любая ошибка глотается молча. */
export function beep(cue: Cue): void {
  if (!enabled) return

  try {
    const ac = audio()
    if (!ac || !bus) return
    for (const n of SEQ[cue]) note(ac, bus, n)
  } catch {
    // Автоплей запрещён или устройство без звука — играем дальше.
  }
}
