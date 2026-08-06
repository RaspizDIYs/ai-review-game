/**
 * Терминал — детективный инструмент ревьюера.
 *
 * Он не говорит, кто убийца. Он даёт зацепки: кто писал этот код, какой у
 * автора почерк ошибок, в какой части решения «деформация», выдержит ли прод
 * задуманное удаление. Дальше игрок думает сам — в этом и разница между
 * «нашёл строку = молодец» и расследованием.
 *
 * Здесь только разбор команд и текст ответа: ни состояния, ни экрана.
 * Всё, что меняет игру, уезжает наружу списком `effects` — по той же причине,
 * по которой из компонента вынесены `round.ts` и `shift.ts`.
 *
 * Два ограничения держат всю механику, и оба не про удобство:
 *
 * - **заряды.** Запросов на смену шесть, и они не восстанавливаются. Таймера
 *   в смене нет, поэтому бесплатная подсказка означала бы «вычерпать терминал
 *   первым же ходом»;
 * - **один `/git-blame` за ход.** Досье собирается по строке за вызов, и без
 *   этого правила весь профиль агента открывался бы за один раунд —
 *   расследование кончалось бы, не начавшись.
 *
 * См. заметку «Дополнительные идеи - Ревью за ии», части 3 и 4.
 */

import type { Agent, AgentSlug } from './agents.ts'
import { fnv1a } from './daily.ts'
import { parseDiff } from './diff.ts'
import { ownLine } from './replies.ts'
import { hits } from './round.ts'
import type { Task } from './types'

/** Тон строки — от него зависит только цвет в терминале. */
export type Tone = 'in' | 'out' | 'muted' | 'good' | 'bad' | 'code' | 'dossier'

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
  /** Что игрок отметил в дифе прямо сейчас — это и проверяет `--dry-run`. */
  selected: readonly number[]
  /** Слежка уже стоит: второй раз за ход её не ставят. */
  watching: readonly number[]
  /** Сколько запросов к терминалу осталось на смену. */
  probes: number
  /** Историю на этом ходу уже смотрели: `/git-blame` доступен раз за ход. */
  blamed: boolean
}

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

/** Символ из шапки ханка: `@@ … @@ namespace clinic {`. Есть не у всех задач. */
function symbolOf(task: Task): string | null {
  const head = task.diff.split('\n').find((l) => l.startsWith('@@'))
  const tail = head?.replace(/^@@[^@]*@@\s*/, '').trim()
  return tail ? tail.replace(/[{:]\s*$/, '').trim() : null
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
 * Объявления, по которым терминал понимает, «в чём» деформация. Порядок
 * важен: сначала то, что называет вещь по имени, потом общие конструкции.
 */
const DECLARATIONS: RegExp[] = [
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  /\bdef\s+(\w+)/,
  /\bclass\s+(\w+)/,
  /\bfunc\s+(?:\([^)]*\)\s*)?(\w+)/,
  /\bfn\s+(\w+)/,
  /\bsub\s+(\w+)/,
  /(?:const|let|var)\s+(\w+)\s*[:=]/,
  /(?:public|private|protected|internal|static|void)\s+[\w<>[\],\s]*?(\w+)\s*\(/,
  /^\s*(\w+)\s*\(\)\s*\{/,
  /(?:CREATE|ALTER)\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
  /\b(?:FROM|UPDATE|INSERT\s+INTO)\s+([a-z_][\w.]*)/i,
  /^\s*(\w[\w-]*):\s*$/,
]

/**
 * В чём деформация: ближайшее объявление выше подозрительной строки.
 *
 * Это и есть ответ терминала — «в расчёте страниц», «в работе с visits».
 * Номера строк он не называет **никогда**: район в семь строк, который тут
 * был раньше, — это фактически адрес, и команда решала задачу за игрока.
 */
export function enclosing(task: Task, line: number): string {
  const source = sourceLines(task)

  for (let n = line; n >= Math.min(...source.keys()); n--) {
    const text = source.get(n)
    if (!text) continue

    for (const rule of DECLARATIONS) {
      const found = rule.exec(text)
      if (found?.[1]) return found[1]
    }
  }

  return symbolOf(task) ?? fileOf(task)
}

const HELP: TerminalLine[] = [
  out('Доступные команды:'),
  muted('  /help                        список команд'),
  muted('  /git-blame <строка>          кто написал строку и чем известен'),
  muted('  /compare-with-blueprint      сравнить с эталоном из базы'),
  muted('  /deploy --dry-run            прогнать удаление отмеченных строк'),
  muted('  /grab-evidence --on-line N   повесить лог на строку и отпустить PR'),
  muted('  /clear                       очистить экран'),
  { tone: 'muted', text: '' },
  muted('Первые три тратят запрос: их на смену шесть, и они не восстанавливаются.'),
  muted('История доступна раз за ход. Слежка тратит не запрос, а весь ход.'),
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

function blame(rest: string, ctx: TerminalContext): TerminalResult {
  const [line] = numbers(rest)
  if (!line) return refuse('нужен номер строки: /git-blame 21')

  // Один запрос истории за ход. Иначе профиль агента собирается за один
  // раунд, и «постепенно» из постановки не работает вовсе.
  if (ctx.blamed) {
    return refuse(
      'история за этот ход уже поднята',
      'Гит отдаёт её раз за ход. Следующий PR — следующий запрос.',
    )
  }

  const source = sourceLines(ctx.task)
  const text = source.get(line)
  if (text === undefined) {
    return refuse(
      `строки ${line} в новой версии файла нет`,
      'Удалённые строки истории не имеют — их автор уже никто.',
    )
  }

  const { author } = ctx
  const bot = botName(author, ctx.task, ctx.pr)
  const opened = ctx.dossier[author.slug] ?? 0
  // Досье открывается по строке за вызов: сразу весь характер — это ответ,
  // а не зацепка. Первая команда всегда что-то даёт, иначе она бесполезна.
  const show = Math.min(author.known.length, opened + 1)

  return {
    lines: [
      { tone: 'code', text: `${String(line).padStart(3)} ${text}` },
      muted(`${commitHash(ctx.task, ctx.pr)} (${bot}  ${commitDate(ctx.task, ctx.pr)}  ${line})`),
      { tone: 'dossier', text: `${bot} · ИИ-агент` },
      { tone: 'dossier', text: `Специализация: ${author.work}` },
      { tone: 'dossier', text: 'Известные проблемы:' },
      ...author.known.slice(0, show).map((k): TerminalLine => ({ tone: 'dossier', text: `  — ${k}` })),
      ...(show < author.known.length
        ? [muted(`  … профиль собран на ${show} из ${author.known.length}`)]
        : [muted('  … профиль собран полностью')]),
      { tone: 'out', text: `${author.name}: ${ownLine(author, `${ctx.task.id}:${line}`)}` },
    ],
    effects: [{ kind: 'probe' }, { kind: 'dossier', agent: author.slug }],
  }
}

/** Место, около которого терминал видит «деформацию». */
function suspect(task: Task): number {
  return task.bugs[0]?.line ?? task.decoys[0]?.line ?? 1
}

const SHAPES = [
  'Архитектура деформирована',
  'Плотность отклонений выше нормы',
  'Контур эталона не сходится',
  'Форма решения поплыла',
]

function blueprint(ctx: TerminalContext): TerminalResult {
  const { task } = ctx
  const where = enclosing(task, suspect(task))
  const shape = SHAPES[fnv1a(`shape:${task.id}`) % SHAPES.length]

  // График бессмысленно рисовать по номерам строк — их команда не называет.
  // Это шкала расхождения с эталоном: «сильно поплыло» против «чуть-чуть».
  const drift = 40 + (fnv1a(`drift:${task.id}`) % 55)
  const bar = `${'█'.repeat(Math.round(drift / 5))}${'░'.repeat(20 - Math.round(drift / 5))}`

  return {
    lines: [
      out('Сверяю с эталоном из базы…'),
      { tone: 'bad', text: `${shape}: ${where}` },
      { tone: 'code', text: `расхождение [${bar}] ${drift}%` },
      { tone: 'muted', text: '' },
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
  if (ctx.watching.length > 0) {
    return refuse(
      'слежка уже поставлена',
      `Логируются строки ${ctx.watching.join(', ')}. Решение по PR всё равно за тобой.`,
    )
  }

  const lines = numbers(rest)
  if (lines.length === 0) return refuse('нужен номер строки: /grab-evidence --on-line 16')

  const source = sourceLines(ctx.task)
  const missing = lines.filter((line) => !source.has(line))
  if (missing.length > 0) {
    return refuse(`в новой версии файла нет строк: ${missing.join(', ')}`)
  }

  return {
    lines: [
      out(`Лог повешен на строки ${lines.join(', ')}.`),
      muted('PR уходит на логирование, а не в прод. Ход потрачен.'),
    ],
    effects: [{ kind: 'watch', lines }],
  }
}

/** Приветствие при открытии терминала. */
export function greeting(repo: string): TerminalLine[] {
  return [
    out(`Добро пожаловать в ${repo} Terminal v1.2.0`),
    muted("Введи 'help' для списка команд."),
  ]
}

/** Тратит ли команда заряд — это же показывает подсказка у поля ввода. */
const COSTLY = ['git-blame', 'blame', 'compare-with-blueprint', 'compare', 'deploy']

/**
 * Выполнить строку. Ведущий слэш необязателен: в заметке команды записаны
 * со слэшем, а руки набирают `help` — принимаем оба варианта.
 */
export function run(input: string, ctx: TerminalContext): TerminalResult {
  const trimmed = input.trim()
  if (trimmed === '') return { lines: [], effects: [] }

  const [head, ...rest] = trimmed.replace(/^\//, '').split(/\s+/)
  const command = head.toLowerCase()
  const tail = rest.join(' ')

  // Заряды кончились — отказ до разбора аргументов: терминал не должен
  // отдавать ничего, за что не заплачено.
  if (ctx.probes <= 0 && COSTLY.includes(command)) {
    return refuse(
      'запросов на эту смену не осталось',
      'Терминал отвечает шесть раз за смену. Дальше — своими глазами.',
    )
  }

  switch (command) {
    case 'help':
    case '?':
      return { lines: HELP, effects: [] }
    case 'git-blame':
    case 'blame':
      return blame(tail, ctx)
    case 'compare-with-blueprint':
    case 'compare':
      return blueprint(ctx)
    case 'deploy':
      return tail.includes('--dry-run')
        ? deploy(ctx)
        : refuse('выкатывать прод отсюда нельзя', 'Есть только /deploy --dry-run — пробная выкладка.')
    case 'grab-evidence':
    case 'grab':
      return grab(tail, ctx)
    case 'clear':
      return { lines: [], effects: [{ kind: 'clear' }] }
    default:
      return refuse(`команда не найдена: ${command}`, "Введи 'help' — покажу, что умею.")
  }
}

/**
 * Оперативный отчёт по слежке — приходит после виртуального тика прода.
 *
 * Угадал — терминал отдаёт точную улику и подсвечивает диапазон строк.
 * Не угадал — «белый шум»: аномалий не обнаружено. Здоровье прода в обоих
 * случаях страдает меньше, чем от обычного пропуска: PR лежал на логировании,
 * а не в проде.
 */
export function report(task: Task, watched: readonly number[]): TerminalLine[] {
  const caught = task.bugs.filter((bug) => watched.some((line) => hits(bug, line)))
  const list = [...watched].sort((a, b) => a - b)

  if (caught.length === 0) {
    return [
      { tone: 'out', text: '[LOG-CAPTURE] Логирование завершено.' },
      muted(
        `Строки ${list.map((n) => String(n).padStart(2, '0')).join(', ')}: аномалий не обнаружено.`,
      ),
      muted('Система работала штатно в контролируемой среде.'),
    ]
  }

  const from = Math.min(...caught.map((b) => b.line))
  const to = Math.max(...caught.map((b) => b.line))

  return [
    { tone: 'bad', text: `[LOG-CAPTURE] Строка ${from} зафиксировала аномалию!` },
    { tone: 'out', text: caught[0].consequence },
    { tone: 'good', text: `Диапазон подтверждён: строки ${from}–${to}.` },
    muted('Здоровье прода не пострадало: код был на логировании.'),
  ]
}

/** Попала ли слежка в подлянку — от этого зависит цена хода. */
export function caught(task: Task, watched: readonly number[]): boolean {
  return task.bugs.some((bug) => watched.some((line) => hits(bug, line)))
}
