/**
 * Метрики. Собираем ровно то, что меняет решения по контенту, и ничего сверх.
 *
 * Что уходит: id задачи, исход раунда, сколько секунд ушло, какая попытка, режим.
 * Чего НЕ уходит: кук, идентификатора игрока, IP (его не пишет и сервер),
 * реферера, разрешения экрана. Склеить события в сессию нельзя — и не нужно:
 * вопрос, на который мы отвечаем, звучит «какая задача как решается»,
 * а не «кто её решал».
 *
 * Отправка картинкой, а не fetch — намеренно: не нужен CORS, не нужен preflight,
 * не блокирует уход со страницы, и любая ошибка сети остаётся ошибкой сети.
 *
 * Адрес не задан (VITE_METRICS_URL пустой) — не уходит ничего вообще.
 */

const URL_ = import.meta.env.VITE_METRICS_URL

function send(params: Record<string, string | number>): void {
  if (!URL_) return

  try {
    const q = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    )
    new Image().src = `${URL_}?${q}`
  } catch {
    // Метрики никогда не должны мешать играть.
  }
}

/** Открыли страницу. Верхняя ступень воронки: зашёл → начал → доиграл. */
export function trackOpen(): void {
  send({ e: 'open' })
}

/**
 * Раунд закончен. Главное событие: из него считается доля нашедших по задаче —
 * единственная цифра, которая чинит сложность, проставленную на глаз.
 */
export function trackRound(input: {
  task: string
  outcome: string
  seconds: number
  attempt: number
  mode: string
  difficulty: number
  /** Шаг «почему»: 1 — назвал причину, 0 — не назвал, пусто — шага не было. */
  reason: boolean | null
}): void {
  send({
    e: 'round',
    t: input.task,
    o: input.outcome,
    s: Math.round(input.seconds),
    a: input.attempt,
    m: input.mode,
    d: input.difficulty,
    // Разрыв между «нашёл» и «понял» — то, ради чего шаг и делался:
    // задача, где строку находят все, а причину никто, написана плохо.
    r: input.reason === null ? '' : input.reason ? 1 : 0,
  })
}

/** Серия закончена — показывает, сколько людей доходит до конца, а сколько бросает. */
export function trackSeries(input: {
  mode: string
  rounds: number
  wins: number
  seconds: number
}): void {
  send({
    e: 'series',
    m: input.mode,
    n: input.rounds,
    w: input.wins,
    s: Math.round(input.seconds),
  })
}
