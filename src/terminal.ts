/**
 * Терминал — детективный инструмент ревьюера.
 *
 * Он не говорит, кто убийца, и не показывает пальцем на строку. Он даёт
 * зацепки: чем известен автор, на что не похожа форма решения, выдержит ли
 * прод задуманное удаление, что видно в логах. Дальше игрок думает сам —
 * в этом и разница между «нашёл строку = молодец» и расследованием.
 *
 * **Ни одна команда не называет номер строки и не цитирует из неё имён.**
 * Это правило важнее удобства: как только терминал произносит `dayOf`,
 * задача превращается в поиск слова по дифу, а из двух подходящих строк
 * вторая закрывается со второй попытки бесплатно. Проверено на живой игре —
 * см. заметку «Добавить игре вариативности».
 *
 * Здесь только разбор команд и текст ответа: ни состояния, ни экрана.
 * Всё, что меняет игру, уезжает наружу списком `effects` — по той же причине,
 * по которой из компонента вынесены `round.ts` и `shift.ts`.
 *
 * Три ограничения держат всю механику, и ни одно не про удобство:
 *
 * - **заряды.** Платных запросов на смену четыре, и они не восстанавливаются;
 * - **один `/blame` за ход.** Он бесплатный — но досье открывается
 *   по строке за вызов, и без этого правила профиль агента собирался бы
 *   за один раунд;
 * - **слежка стоит ход.** `/log` — единственная команда, которая
 *   не подсказывает, а покупает наблюдение, и платить за него нечем, кроме
 *   собственного хода.
 *
 * См. заметку «Дополнительные идеи - Ревью за ии», части 3 и 4.
 */

import type { Agent, AgentSlug } from './agents.ts'
import { fnv1a } from './daily.ts'
import { diffStat, parseDiff } from './diff.ts'
import { ownLine } from './replies.ts'
import { hits } from './round.ts'
import type { Task } from './types'

/** Тон строки — от него зависит только цвет в терминале. */
export type Tone = 'in' | 'out' | 'muted' | 'good' | 'bad' | 'code' | 'dossier' | 'art'

export interface TerminalLine {
  tone: Tone
  text: string
}

/**
 * Что команда сделала с игрой. Терминал сам ничего не меняет: заряд списывает
 * смена, слежку ставит она же, досье пишется в профиль.
 */
export type Effect =
  /** Списать заряд терминала. */
  | { kind: 'probe' }
  /** Открыть игроку ещё одну строку досье на агента. */
  | { kind: 'dossier'; agent: AgentSlug }
  /** Историю за этот ход подняли: второй раз нельзя, но и не стоит заряда. */
  | { kind: 'blamed' }
  /** Повесить лог на строки и отпустить PR на логирование: ход кончается. */
  | { kind: 'watch'; lines: number[] }
  /** Очистить экран. Ничего не стоит и ничего не меняет. */
  | { kind: 'clear' }

export interface TerminalResult {
  lines: TerminalLine[]
  effects: Effect[]
}

export interface TerminalContext {
  task: Task
  pr: number
  /** Кто написал этот PR. */
  author: Agent
  /** Сколько строк досье уже открыто по каждому агенту. */
  dossier: Readonly<Record<string, number>>
  /** Что игрок отметил в дифе прямо сейчас — это и проверяет `/deploy`. */
  selected: readonly number[]
  /** Слежка уже стоит: второй раз за ход её не ставят. */
  watching: readonly number[]
  /** Сколько запросов к терминалу осталось на смену. */
  probes: number
  /** Историю на этом ходу уже смотрели: `/blame` доступен раз за ход. */
  blamed: boolean
  /**
   * Слежка вообще возможна. Во время починки — нет: она платит ходом смены,
   * а починка ходов не тратит, и платить за наблюдение стало бы нечем.
   */
  canWatch: boolean
}

/** Сколько строк максимум берёт под наблюдение одна слежка. */
export const WATCH_LIMIT = 4

function out(text: string): TerminalLine {
  return { tone: 'out', text }
}

function muted(text: string): TerminalLine {
  return { tone: 'muted', text }
}

function refuse(text: string, hint?: string): TerminalResult {
  return {
    lines: [{ tone: 'bad', text }, ...(hint ? [muted(hint)] : [])],
    effects: [],
  }
}

/** Короткий хэш коммита — его же печатает настоящий `git blame`. */
export function commitHash(task: Task, pr: number): string {
  return fnv1a(`commit:${task.id}:${pr}`).toString(16).padStart(8, '0').slice(0, 8)
}

/** Дата коммита. Выдумывать «сегодня» нельзя: игра не должна зависеть от часов. */
function commitDate(task: Task, pr: number): string {
  const seed = fnv1a(`when:${task.id}:${pr}`)
  const month = String((seed % 12) + 1).padStart(2, '0')
  const day = String(((seed >>> 4) % 28) + 1).padStart(2, '0')
  const hour = String((seed >>> 8) % 24).padStart(2, '0')
  const minute = String((seed >>> 13) % 60).padStart(2, '0')
  return `2026-${month}-${day} ${hour}:${minute}:${String((seed >>> 19) % 60).padStart(2, '0')} +0300`
}

/** Имя бота: у агента их несколько версий, как у настоящей модели. */
export function botName(agent: Agent, task: Task, pr: number): string {
  return `${agent.name}_v${(fnv1a(`ver:${agent.slug}:${task.id}:${pr}`) % 4) + 1}`
}

/** Файл, который правили, — из заголовка дифа. */
function fileOf(task: Task): string {
  const head = task.diff.split('\n').find((l) => l.startsWith('+++ '))
  return head ? head.replace(/^\+\+\+ b\//, '') : 'файл'
}

/** Строки новой версии файла, по номерам. */
function sourceLines(task: Task): Map<number, string> {
  const map = new Map<number, string>()
  for (const line of parseDiff(task.diff)) {
    if (line.newNo !== null) map.set(line.newNo, line.text)
  }
  return map
}

/**
 * Заставка терминала. Дешёвый способ сказать «это не браузер, это консоль».
 *
 * Нарисована полублоками, а не палочками из `|`, `_` и `\`. Прежняя была
 * набрана шрифтом figlet в пять строк — и на ширине панели её приходилось
 * ужимать до шести пикселей, отчего `I` читалась как `T`, а `V` как `U`:
 * вместо AI-REVIEW выходило AT-REUTEW. Здесь две строки и сплошные штрихи,
 * которые не разваливаются на мелком кегле.
 */
const BANNER = [
  '▄▀█ █ ▄▄▄ █▀█ █▀▀ █ █ █ █▀▀ █ █ █',
  '█▀█ █     █▀▄ █▄▄ ▀▄▀ █ █▄▄ █▄█▄█',
]

const HELP: TerminalLine[] = [
  out('Доступные команды:'),
  muted('  /help            список команд'),
  muted('  /blame           кто написал этот PR и чем известен'),
  muted('  /check           на что не похожа форма решения'),
  muted('  /deploy          прогнать удаление отмеченных строк'),
  muted('  /log N           повесить лог и отпустить PR на прогон'),
  muted('  /clear           очистить экран'),
  { tone: 'muted', text: '' },
  muted('Строк в логе может быть несколько — через запятую:'),
  muted(`  /log 8,9,12      (до ${WATCH_LIMIT} строк за раз)`),
  { tone: 'muted', text: '' },
  muted('Заряд тратят /check и /deploy.'),
  muted('/blame бесплатен, но доступен раз за ход. /log тратит весь ход.'),
  muted('Номеров строк терминал не называет никогда — ищешь всё равно ты.'),
]

/** Разбор `--on-line 15 16` и `--on-line=15,16` — оба варианта живые. */
function numbers(rest: string): number[] {
  const seen = new Set<number>()
  for (const chunk of rest.replace(/--on-line/g, ' ').split(/[\s,=]+/)) {
    const n = Number(chunk)
    if (Number.isInteger(n) && n > 0) seen.add(n)
  }
  return [...seen].sort((a, b) => a - b)
}

/**
 * История правки: кто написал этот PR.
 *
 * **Номер строки команда не спрашивает.** Спрашивала — и это было враньём:
 * весь пул-реквест пишет один агент, поэтому какую строку ни назови, ответ
 * один и тот же. Аргумент выглядел выбором, не будучи им, и первым делом
 * учил игрока, что выбор здесь ничего не решает.
 *
 * Имени автора здесь нет — есть его почерк, по строке за вызов. Игрок сам
 * решает, чей это почерк, и сверяется с досье, которое собирал прошлые смены.
 * Когда собраны все известные проблемы агента, профиль раскрывается целиком
 * и вместе с именем: расследование должно чем-то заканчиваться.
 *
 * Бесплатна и доступна раз за ход. Платить за неё нечем — она не сужает круг
 * строк, а только рассказывает про автора.
 */
function blame(ctx: TerminalContext): TerminalResult {
  if (ctx.blamed) {
    return refuse(
      'история за этот ход уже поднята',
      'Гит отдаёт её раз за ход. Следующий PR — следующий запрос.',
    )
  }

  const { author, task } = ctx
  const opened = ctx.dossier[author.slug] ?? 0
  // Досье открывается по строке за вызов: сразу весь характер — это ответ,
  // а не зацепка. Первая команда всегда что-то даёт, иначе она бесполезна.
  const show = Math.min(author.known.length, opened + 1)
  const complete = show >= author.known.length

  // Пока профиль не собран, автор — безымянный `ai[bot]`: имя выдало бы
  // всё сразу, а собирают тут именно имя.
  const signature = complete ? botName(author, task, ctx.pr) : 'ai[bot]'
  const { adds, dels } = diffStat(task.diff)

  return {
    lines: [
      out(`Поднимаю историю ${fileOf(task)}…`),
      muted(
        `${commitHash(task, ctx.pr)}  ${signature}  ${commitDate(task, ctx.pr)}  (+${adds} −${dels})`,
      ),
      muted('Все строки правки — одного автора. Отдельной истории у них нет.'),
      { tone: 'muted', text: '' },
      ...(complete
        ? [
            { tone: 'good' as const, text: `Профиль собран: ${author.name} · ${author.ru}` },
            { tone: 'dossier' as const, text: `Характер: ${author.trait}` },
            { tone: 'dossier' as const, text: `Специализация: ${author.work}` },
          ]
        : [{ tone: 'dossier' as const, text: 'Автор правки известен вот чем:' }]),
      ...author.known
        .slice(0, show)
        .map((k): TerminalLine => ({ tone: 'dossier', text: `  — ${k}` })),
      complete
        ? muted('  … профиль собран полностью')
        : muted(`  … собрано ${show} из ${author.known.length}`),
      ...(complete
        ? [{ tone: 'out' as const, text: `${author.name}: ${ownLine(author, task.id)}` }]
        : []),
    ],
    effects: [{ kind: 'blamed' }, { kind: 'dossier', agent: author.slug }],
  }
}

/**
 * Семьи подлянок для сверки с эталоном.
 *
 * Эталон не помнит строк — он помнит, как обычно устроено правильное решение.
 * Поэтому ответ команды всегда про **род** расхождения, а не про место: она
 * говорит, чего в этой форме не хватает или что в ней лишнее.
 *
 * Порядок важен: первое совпадение по подстроке тега и выигрывает, поэтому
 * узкие семьи стоят выше общих.
 */
const FAMILIES: { match: RegExp; shape: string; note: string }[] = [
  {
    match: /secret|credential|injection|traversal|token|port-published|select-star/,
    shape: 'Контур доверия разомкнут',
    note: 'Эталон нигде не пускает чужое туда, где его читают как своё. Здесь такая граница есть не везде.',
  },
  {
    match: /error|panic|unwrap|rescue|swallow|healthcheck|assert|mock/,
    shape: 'Ветка неудачи отсутствует',
    note: 'В эталоне у каждого шага есть исход «не получилось». В этом решении такой исход некому заметить.',
  },
  {
    match: /datetime|utc|local|dateformat|timezone/,
    shape: 'Ось времени смещена',
    note: 'Эталон всюду считает время от одной точки отсчёта. Здесь их, похоже, две.',
  },
  {
    match: /money|decimal|division|overflow|float|cast/,
    shape: 'Числовая форма поплыла',
    note: 'Эталон бережёт точность там, где её нельзя терять. В этом решении она где-то теряется по дороге.',
  },
  {
    match: /off-by-one|index|boundary|range|slice|pagination|glob/,
    shape: 'Границы диапазона не сходятся',
    note: 'Эталон одинаково обращается с краями набора. Здесь один из краёв живёт по своим правилам.',
  },
  {
    match: /async|promise|thread|blocking|context-leak|main-thread|stale/,
    shape: 'Порядок событий не гарантирован',
    note: 'Эталон дожидается того, что запустил. Здесь есть шаг, который никто не ждёт.',
  },
  {
    match: /cache|n-plus-one|httpclient|cleanup|cycle|dangling|generator|retain/,
    shape: 'Жизненный цикл не замкнут',
    note: 'В эталоне у всего, что заводят, есть момент, когда это отпускают. Здесь такой момент найден не для всего.',
  },
  {
    match: /mutat|shared|mutable|default-arg|class-attribute|constant|props/,
    shape: 'Владение данными размыто',
    note: 'Эталон не даёт двум местам править одно и то же. Здесь общее состояние досталось сразу нескольким.',
  },
  {
    match: /clone|merge|decode-shape|reference-equality|symbol-string|rename|dependency/,
    shape: 'Форма данных меняется по дороге',
    note: 'Эталон держит одну форму от входа до выхода. Здесь на полпути она становится другой.',
  },
  {
    match: /join|group-by|not-in|transaction|where|migration|backfill|null/,
    shape: 'Множество отобрано не тем правилом',
    note: 'Эталон отбирает ровно то, о чём просили. Здесь набор получается шире или уже, чем задумано.',
  },
  {
    match: /docker|image|ci-|lockfile|cache-key|deploy-trigger|container|dev-mode/,
    shape: 'Окружение собрано не воспроизводимо',
    note: 'Эталон получает один и тот же результат при каждой сборке. Здесь результат зависит от того, когда собирали.',
  },
  {
    match: /rm-with|cd-unchecked|pipefail|unquoted|force-push|rebase|reset-hard|commit-everything/,
    shape: 'Шаг необратим и ничем не прикрыт',
    note: 'Эталон проверяет почву перед тем, как что-то стереть. Здесь проверка пропущена.',
  },
  {
    match: /encoding|comparison|normalization|falsy|signed/,
    shape: 'Сравнение опирается на неявное правило',
    note: 'Эталон сравнивает то, что сравнимо. Здесь два разных значения где-то считаются одним.',
  },
  {
    match: /optional-chain|result-discarded|nil-map-write|uninitialized/,
    shape: 'Пустота выдаётся за значение',
    note: 'Эталон отличает «нет данных» от «данные такие». Здесь одно подменено другим, и дальше никто не спросит.',
  },
  {
    match: /match-case|retry-on-non|shadowed/,
    shape: 'Условие шире, чем задумано',
    note: 'Эталон разбирает случаи по одному. Здесь одна ветка забирает себе больше, чем ей причитается.',
  },
  {
    match: /record-shares|debug-left/,
    shape: 'Обещание оболочки не выполняется',
    note: 'Снаружи решение выглядит так, будто за него отвечает форма. Эталон на форму в этом месте не полагается.',
  },
]

const GENERIC = {
  shape: 'Форма решения поплыла',
  note: 'Эталон устроен иначе, но чем именно — база сформулировать не смогла. Читай сам.',
}

/** Род расхождения по тегу подлянки. Ни имён, ни строк — только форма. */
export function family(tag: string): { shape: string; note: string } {
  return FAMILIES.find((f) => f.match.test(tag)) ?? GENERIC
}

/**
 * Сверка с эталоном.
 *
 * Раньше команда печатала имя функции из подозрительной строки — то есть
 * буквально ключевое слово для поиска по дифу. Теперь она описывает род
 * расхождения человеческим языком: «ветка неудачи отсутствует», «границы
 * диапазона не сходятся». Это сужает то, что искать, но не то, где искать,
 * и никуда не годится как подстановка в Ctrl+F.
 */
function blueprint(ctx: TerminalContext): TerminalResult {
  const { task } = ctx
  const tag = task.bugs[0]?.tag ?? ''
  const { shape, note } = family(tag)

  // График бессмысленно рисовать по номерам строк — их команда не называет.
  // Это шкала расхождения с эталоном: «сильно поплыло» против «чуть-чуть».
  const drift = 40 + (fnv1a(`drift:${task.id}`) % 55)
  const bar = `${'█'.repeat(Math.round(drift / 5))}${'░'.repeat(20 - Math.round(drift / 5))}`

  return {
    lines: [
      out('Сверяю с эталоном из базы…'),
      { tone: 'bad', text: `${shape}.` },
      { tone: 'code', text: `расхождение [${bar}] ${drift}%` },
      { tone: 'muted', text: '' },
      out(note),
      muted('Эталон помнит форму решения, а не строки: где именно — он не знает.'),
    ],
    effects: [{ kind: 'probe' }],
  }
}

/** Чего стоит проду каждая ошибка в отмеченном. Гипотеза, не проверено. */
const LEFT_BUG = 25
const EXTRA_LINE = 20

/**
 * Пробная выкладка отмеченного.
 *
 * Число — не «правильно/неправильно», а оценка того, каким прод станет после
 * такой правки. Оставленная подлянка и снесённая рабочая строка стоят
 * по-разному, поэтому два разных неверных ответа дают два разных числа, —
 * а раньше любой промах давал одни и те же 23%, и команда сводилась
 * к лампочке «да/нет».
 */
function deploy(ctx: TerminalContext): TerminalResult {
  const { task, selected } = ctx
  if (selected.length === 0) {
    return refuse(
      'нечего катить: строки не отмечены',
      'Отметь в дифе то, что собираешься удалить, и повтори.',
    )
  }

  const extras = selected.filter((line) => !task.bugs.some((bug) => hits(bug, line))).length
  const left = task.bugs.filter((bug) => !selected.some((line) => hits(bug, line))).length
  const stability = Math.max(5, 100 - left * LEFT_BUG - extras * EXTRA_LINE)
  const ok = extras === 0 && left === 0 && !task.clean

  const filled = Math.round(stability / 5)
  const bar = `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${stability}%`

  return {
    lines: ok
      ? [
          out('Пробная выкладка…'),
          { tone: 'good', text: `Стабильность прода ${bar}` },
          { tone: 'good', text: 'Сборка зелёная. Изменение можно выкатывать.' },
        ]
      : [
          out('Пробная выкладка…'),
          { tone: stability >= 60 ? 'out' : 'bad', text: `Стабильность прода ${bar}` },
          { tone: 'bad', text: 'Ошибка компиляции! Попробуйте ещё раз.' },
          // Сколько именно строк лишних, терминал не говорит: это был бы
          // перебор по одной строке за раз.
          muted('Правка не сходится с тем, что от неё ждут.'),
        ],
    effects: [{ kind: 'probe' }],
  }
}

function grab(rest: string, ctx: TerminalContext): TerminalResult {
  if (!ctx.canWatch) {
    return refuse(
      'наблюдение отсюда не поставить',
      'Прогон под логами стоит хода смены, а тут ходы не идут. Смотри своими глазами.',
    )
  }

  if (ctx.watching.length > 0) {
    return refuse(
      'слежка уже поставлена',
      `Логируются строки ${ctx.watching.join(', ')}. Решение по PR всё равно за тобой.`,
    )
  }

  const lines = numbers(rest)
  if (lines.length === 0) {
    return refuse(
      'нужен номер строки: /log 16',
      `Можно сразу несколько через запятую: /log 8,9,12 — до ${WATCH_LIMIT} строк.`,
    )
  }

  // Без потолка слежка вырождается в «повесить лог на весь файл»: ход
  // потрачен, зато гипотезы не было вовсе. Четыре строки — это ещё гипотеза.
  if (lines.length > WATCH_LIMIT) {
    return refuse(
      `столько строк сразу не залогировать: ${lines.length} из ${WATCH_LIMIT}`,
      'Прогон под наблюдением стоит хода — под него выбирают участок, а не файл.',
    )
  }

  const source = sourceLines(ctx.task)
  const missing = lines.filter((line) => !source.has(line))
  if (missing.length > 0) {
    return refuse(`в новой версии файла нет строк: ${missing.join(', ')}`)
  }

  return {
    lines: [
      out(`Лог повешен на строки ${lines.join(', ')}.`),
      muted('PR уходит на прогон под наблюдением, а не в прод. Ход потрачен.'),
    ],
    effects: [{ kind: 'watch', lines }],
  }
}

/** Приветствие при открытии терминала. */
export function greeting(repo: string): TerminalLine[] {
  return [
    ...BANNER.map((text): TerminalLine => ({ tone: 'art', text })),
    { tone: 'muted', text: '' },
    out(`${repo} Terminal v1.2.0 — инструмент ревьюера`),
    muted("Введи 'help' для списка команд."),
  ]
}

/**
 * Как называется команда на самом деле.
 *
 * Имена короткие и все в одном стиле — одно слово, четыре-шесть букв.
 * Раньше были `compare-with-blueprint` и `grab-evidence --on-line`: набирать
 * такое на телефоне невозможно, а читать вслух стыдно. Длинные варианты
 * остались псевдонимами: они записаны в старых заметках, и ломать их незачем.
 */
const ALIASES: Record<string, string> = {
  '?': 'help',
  'git-blame': 'blame',
  'compare-with-blueprint': 'check',
  compare: 'check',
  blueprint: 'check',
  'grab-evidence': 'log',
  grab: 'log',
  watch: 'log',
}

/** Тратит ли команда заряд — это же показывает значок на кнопке. */
const COSTLY = ['check', 'deploy']

/**
 * Выполнить строку. Ведущий слэш необязателен: в заметке команды записаны
 * со слэшем, а руки набирают `help` — принимаем оба варианта.
 */
export function run(input: string, ctx: TerminalContext): TerminalResult {
  const trimmed = input.trim()
  if (trimmed === '') return { lines: [], effects: [] }

  const [head, ...rest] = trimmed.replace(/^\//, '').split(/\s+/)
  const typed = head.toLowerCase()
  const command = ALIASES[typed] ?? typed
  const tail = rest.join(' ')

  // Заряды кончились — отказ до разбора аргументов: терминал не должен
  // отдавать ничего, за что не заплачено.
  if (ctx.probes <= 0 && COSTLY.includes(command)) {
    return refuse(
      'запросов на эту смену не осталось',
      'Платные запросы кончились. /blame и /log ещё работают.',
    )
  }

  switch (command) {
    case 'help':
      return { lines: HELP, effects: [] }
    case 'blame':
      return blame(ctx)
    case 'check':
      return blueprint(ctx)
    case 'deploy':
      return deploy(ctx)
    case 'log':
      return grab(tail, ctx)
    case 'clear':
      return { lines: [], effects: [{ kind: 'clear' }] }
    default:
      return refuse(`команда не найдена: ${typed}`, "Введи 'help' — покажу, что умею.")
  }
}

/** Симптомы белого шума — их печатает лог, когда наблюдение ничего не поймало. */
const QUIET = [
  'вызовов за прогон: в пределах ожидаемого',
  'значения на выходе совпали с входными ожиданиями',
  'ветка исполнена, исключений не зафиксировано',
  'аллокации стабильны, задержка в норме',
]

/**
 * Оперативный отчёт по слежке — приходит после виртуального тика прода.
 *
 * Что он **не** делает: не называет строку с подлянкой и не подсвечивает
 * диапазон. Раньше делал — и слежка превращалась в «повесь лог на полфайла,
 * получи адрес». Теперь она покупает другое: если наблюдение задело подлянку,
 * лог показывает, **чем именно это кончится в проде** (последствие из задачи).
 * Знать род аварии полезно, найти строку по нему всё равно надо самому.
 *
 * Здоровье прода в обоих случаях страдает меньше, чем от обычного пропуска:
 * PR лежал под наблюдением, а не в бою.
 */
export function report(task: Task, watched: readonly number[]): TerminalLine[] {
  const caughtBugs = task.bugs.filter((bug) => watched.some((line) => hits(bug, line)))
  const list = [...watched].sort((a, b) => a - b)

  const trace = list.map(
    (n): TerminalLine => muted(`  · участок #${n}: ${QUIET[fnv1a(`q:${task.id}:${n}`) % QUIET.length]}`),
  )

  if (caughtBugs.length === 0) {
    return [
      { tone: 'out', text: '[LOG-CAPTURE] Прогон под наблюдением завершён.' },
      ...trace,
      muted('Отклонений не зафиксировано. Система работала штатно.'),
      muted('Наблюдение не доказывает, что здесь чисто, — только что здесь тихо.'),
    ]
  }

  return [
    { tone: 'bad', text: '[LOG-CAPTURE] Наблюдение зафиксировало отклонение.' },
    ...trace,
    { tone: 'muted', text: '' },
    out('Чем это кончится, если выпустить как есть:'),
    ...caughtBugs.map((bug): TerminalLine => ({ tone: 'bad', text: `  ${bug.consequence}` })),
    { tone: 'muted', text: '' },
    muted('Где именно это происходит, лог не знает: он видит поведение, а не причину.'),
    muted('Здоровье прода не пострадало: код был под наблюдением.'),
  ]
}

/** Попала ли слежка в подлянку — от этого зависит цена хода. */
export function caught(task: Task, watched: readonly number[]): boolean {
  return task.bugs.some((bug) => watched.some((line) => hits(bug, line)))
}
