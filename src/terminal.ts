/**
 * Терминал — детективный инструмент ревьюера.
 *
 * Он не говорит, кто убийца. Он даёт зацепки: кто писал этот код, какой у
 * автора почерк ошибок, в каком районе файла «деформация», выдержит ли прод
 * задуманное удаление. Дальше игрок думает сам — в этом и разница между
 * «нашёл строку = молодец» и расследованием.
 *
 * Здесь только разбор команд и текст ответа: ни состояния, ни экрана.
 * Всё, что меняет игру, уезжает наружу списком `effects` — по той же причине,
 * по которой из компонента вынесены `round.ts` и `shift.ts`.
 *
 * Терминал живёт только в смене: `/grab-evidence` и `/deploy --dry-run`
 * опираются на здоровье прода и на «виртуальный тик», а их нет ни в дневном
 * челлендже, ни в подборке.
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
 * Что команда сделала с игрой. Терминал сам ничего не меняет: цену времени
 * снимает экран ревью, слежку ставит смена, досье пишется в профиль.
 */
export type Effect =
  /** Списать секунды с таймера раунда — плата за подсказку. */
  | { kind: 'time'; seconds: number }
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
}

/** Цена подсказки в секундах раунда. Терминал — не бесплатный чит. */
export const COST = { blame: 5, blueprint: 10, deploy: 20 } as const

/** Сколько строк вокруг подозрительного места показывает `compare-with-blueprint`. */
const BAND = 3

function out(text: string): TerminalLine {
  return { tone: 'out', text }
}

function muted(text: string): TerminalLine {
  return { tone: 'muted', text }
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

const HELP: TerminalLine[] = [
  out('Доступные команды:'),
  muted('  /help                        список команд'),
  muted(`  /git-blame <строка>          кто написал строку и чем известен  (−${COST.blame} с)`),
  muted(`  /compare-with-blueprint      сравнить с эталоном из базы        (−${COST.blueprint} с)`),
  muted(`  /deploy --dry-run            прогнать удаление отмеченных строк (−${COST.deploy} с)`),
  muted('  /grab-evidence --on-line N   повесить лог на строку и отпустить PR'),
  muted('  /clear                       очистить экран'),
  { tone: 'muted', text: '' },
  muted('Подсказки стоят времени раунда. Слежка стоит хода.'),
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

function unknown(command: string): TerminalResult {
  return {
    lines: [
      { tone: 'bad', text: `команда не найдена: ${command}` },
      muted("Введи 'help' — покажу, что умею."),
    ],
    effects: [],
  }
}

function blame(rest: string, ctx: TerminalContext): TerminalResult {
  const [line] = numbers(rest)
  if (!line) {
    return { lines: [{ tone: 'bad', text: 'нужен номер строки: /git-blame 21' }], effects: [] }
  }

  const source = sourceLines(ctx.task)
  const text = source.get(line)
  if (text === undefined) {
    return {
      lines: [
        { tone: 'bad', text: `строки ${line} в новой версии файла нет` },
        muted('Удалённые строки истории не имеют — их автор уже никто.'),
      ],
      effects: [],
    }
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
    effects: [
      { kind: 'time', seconds: COST.blame },
      { kind: 'dossier', agent: author.slug },
    ],
  }
}

/** Место, вокруг которого терминал видит «деформацию». */
function suspectLine(task: Task): number {
  const anchor = task.bugs[0]?.line ?? task.decoys[0]?.line
  if (anchor === undefined) {
    const numbers = [...sourceLines(task).keys()]
    return numbers[Math.floor(numbers.length / 2)] ?? 1
  }

  // Центр смещён на пару строк: район, а не адрес. Иначе команда называет
  // подлянку прямо, и искать больше нечего.
  return anchor + ((fnv1a(`blueprint:${task.id}`) % (BAND * 2 + 1)) - BAND)
}

const SHAPES = [
  'Архитектура деформирована',
  'Плотность отклонений выше нормы',
  'Контур эталона не сходится',
  'Форма решения поплыла',
]

function blueprint(ctx: TerminalContext): TerminalResult {
  const { task } = ctx
  const known = [...sourceLines(task).keys()]
  const min = Math.min(...known)
  const max = Math.max(...known)

  const center = Math.max(min + BAND, Math.min(max - BAND, suspectLine(task)))
  const from = Math.max(min, center - BAND)
  const to = Math.min(max, center + BAND)

  const where = symbolOf(task) ?? fileOf(task)
  const shape = SHAPES[fnv1a(`shape:${task.id}`) % SHAPES.length]

  // Столбики — тот самый «метафорический график». Пик там же, где район:
  // цифр он не даёт, но взгляд цепляется.
  const chart = known
    .filter((n) => n >= from - BAND * 2 && n <= to + BAND * 2)
    .map((n) => {
      const height = Math.max(1, 7 - Math.abs(n - center))
      return `${String(n).padStart(3)} ${'█'.repeat(height)}`
    })

  return {
    lines: [
      out('Сверяю с эталоном из базы…'),
      { tone: 'bad', text: `${shape}: ${where}` },
      muted(`Район отклонения: строки ${from}–${to}`),
      { tone: 'muted', text: '' },
      ...chart.map((text): TerminalLine => ({ tone: 'code', text })),
      { tone: 'muted', text: '' },
      muted('Точное место эталон не знает: он помнит форму, а не строки.'),
    ],
    effects: [{ kind: 'time', seconds: COST.blueprint }],
  }
}

function deploy(ctx: TerminalContext): TerminalResult {
  const { task, selected } = ctx
  if (selected.length === 0) {
    return {
      lines: [
        { tone: 'bad', text: 'нечего катить: строки не отмечены' },
        muted('Отметь в дифе то, что собираешься удалить, и повтори.'),
      ],
      effects: [],
    }
  }

  const wrong = selected.filter((line) => !task.bugs.some((bug) => hits(bug, line)))
  const covered = task.bugs.filter((bug) => selected.some((line) => hits(bug, line))).length
  const ok = wrong.length === 0 && covered === task.bugs.length && !task.clean

  const bar = (percent: number) =>
    `[${'█'.repeat(Math.round(percent / 5))}${'░'.repeat(20 - Math.round(percent / 5))}] ${percent}%`

  return {
    lines: ok
      ? [
          out('Пробная выкладка…'),
          { tone: 'good', text: `Стабильность прода ${bar(97)}` },
          { tone: 'good', text: 'Сборка зелёная. Изменение можно выкатывать.' },
        ]
      : [
          out('Пробная выкладка…'),
          { tone: 'bad', text: `Стабильность прода ${bar(23)}` },
          { tone: 'bad', text: 'Ошибка компиляции! Попробуйте ещё раз.' },
          muted(
            task.clean || covered === 0
              ? 'Ни одна из отмеченных строк не мешала сборке.'
              : 'Часть отмеченного трогать не следовало.',
          ),
        ],
    effects: [{ kind: 'time', seconds: COST.deploy }],
  }
}

function grab(rest: string, ctx: TerminalContext): TerminalResult {
  if (ctx.watching.length > 0) {
    return {
      lines: [
        { tone: 'bad', text: 'слежка уже поставлена' },
        muted(`Логируются строки ${ctx.watching.join(', ')}. Отпусти PR и жди отчёт.`),
      ],
      effects: [],
    }
  }

  const lines = numbers(rest)
  if (lines.length === 0) {
    return {
      lines: [{ tone: 'bad', text: 'нужен номер строки: /grab-evidence --on-line 16' }],
      effects: [],
    }
  }

  const source = sourceLines(ctx.task)
  const missing = lines.filter((line) => !source.has(line))
  if (missing.length > 0) {
    return {
      lines: [{ tone: 'bad', text: `в новой версии файла нет строк: ${missing.join(', ')}` }],
      effects: [],
    }
  }

  return {
    lines: [
      out(`Лог повешен на строки ${lines.join(', ')}.`),
      muted('PR уходит на логирование, а не в прод. Ход потрачен.'),
      muted('Отчёт придёт после виртуального тика прода.'),
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
        : {
            lines: [
              { tone: 'bad', text: 'выкатывать прод отсюда нельзя' },
              muted('Есть только /deploy --dry-run — пробная выкладка.'),
            ],
            effects: [],
          }
    case 'grab-evidence':
    case 'grab':
      return grab(tail, ctx)
    case 'clear':
      return { lines: [], effects: [{ kind: 'clear' }] }
    default:
      return unknown(command)
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
