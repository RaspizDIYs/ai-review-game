/**
 * ИИ-агенты: те, кто «написал» код, который ты ревьюишь.
 *
 * Смысл не в украшении. Игра про недоверие к уверенной машине, и уверенность
 * должна звучать голосом: агент говорит, что всё проверил, и ошибается.
 * Цвет агента становится акцентом интерфейса на весь раунд — так экран
 * помнит, с кем ты сейчас имеешь дело.
 *
 * **Языка у агента больше нет.** Раньше каждый агент писал на своём стеке,
 * и это делало его декорацией: узнать автора по языку — не расследование.
 * Теперь агента выдаёт не язык, а **почерк ошибок**: набор подлянок, которые
 * он делает чаще остальных. Отсюда и детектив — см. `handwriting` ниже
 * и терминал (`terminal.ts`).
 *
 * Портреты кладутся в `public/agents/<slug>.png`. Нет файла — рисуется
 * монограмма в цвет агента, интерфейс от этого не разъезжается.
 *
 * См. заметку «Дополнительные идеи - Ревью за ии (Терминал, ИИ агенты)»,
 * части 1 и 2.
 */

import { fnv1a } from './daily.ts'
import type { Task } from './types'

export type AgentSlug =
  | 'architect'
  | 'oracle'
  | 'commander'
  | 'guardian'
  | 'optimizer'
  | 'collector'
  | 'diplomat'
  | 'trendsetter'

/** Из какого мешка фраз агент отвечает. Раскладка — в `replies.ts`. */
export type Voice = 'sorry' | 'fixed' | 'overreach' | 'deny' | 'selfaware'

export interface Agent {
  slug: AgentSlug
  name: string
  ru: string
  color: string
  /** Психология одной строкой — она же подпись под портретом. */
  trait: string
  work: string
  /**
   * Почерк: теги подлянок, которые этот агент делает чаще других. Не «только
   * он»: любую из них может допустить любой агент, просто у автора с таким
   * характером она выпадает заметно чаще (см. `authorOf`).
   */
  handwriting: readonly string[]
  /**
   * Досье: что о нём знает терминал. Открывается по одной строке за вызов
   * `/git-blame` — сразу весь характер не показываем, иначе расследование
   * заканчивается на первой команде.
   */
  known: readonly string[]
  /** Что говорит на брифинге — по кругу, чтобы не повторяться в серии. */
  briefs: readonly string[]
  /**
   * Комментарии, которые он оставляет прямо в коде.
   *
   * Это подсказка про автора, а не про подлянку: комментарий садится на
   * случайную добавленную строку и никуда не показывает. Зато он звучит
   * ровно так, как думает этот агент, — и в слепой смене это единственная
   * зацепка, которую видно, не открывая терминал.
   */
  notes: readonly string[]
  /** Мешки фраз, из которых он отвечает на обвинение. Первый — основной. */
  voice: readonly Voice[]
}

export const AGENTS: Record<AgentSlug, Agent> = {
  architect: {
    slug: 'architect',
    name: 'Architect',
    ru: 'Архитектор',
    color: '#38bdf8',
    trait: 'строит небоскрёб там, где нужна будка',
    work: 'слои, контракты, абстракции',
    handwriting: [
      'json-clone-loses-types',
      'shallow-merge',
      'json-decode-shape',
      'reference-equality',
      'symbol-string-key',
      'props-mutated-in-place',
      'broken-data-dependency',
      'rename-breaks-running-code',
      'shared-ptr-cycle',
      'retain-cycle',
      'index-as-key',
      'not-null-without-default',
      'group-by-incomplete',
      'bigdecimal-scale',
      'backfill-in-one-statement',
    ],
    known: [
      'Заворачивает простое действие в лишний слой',
      'Путается в собственных абстракциях: объект приходит не тот, что ждали',
      'Оставляет заготовки «на будущее», которые ломают настоящее',
      'Меняет форму данных на полпути и забывает об этом на другом конце',
    ],
    briefs: [
      'Структура продумана на два шага вперёд. Компонент делает ровно то, что просили.',
      'Слои разделены, зависимости идут в одну сторону. Смотреть особо нечего.',
      'Я закладывала это под рост. Сейчас выглядит избыточно — через полгода не будет.',
    ],
    notes: [
      'на вырост: следующий слой ляжет сюда же',
      'вынес отдельно — так границы честнее',
      'здесь будет точка расширения, пока пустая',
      'эта обёртка лишней не будет',
    ],
    voice: ['sorry', 'overreach'],
  },
  oracle: {
    slug: 'oracle',
    name: 'Oracle',
    ru: 'Оракул',
    color: '#2dd4bf',
    trait: 'считает вероятности вместо того, чтобы проверить',
    work: 'прогнозы, асинхронность, время',
    handwriting: [
      'floating-promise',
      'async-void',
      'sync-over-async',
      'blocking-in-async',
      'context-leak',
      'stale-state-update',
      'off-main-thread-ui',
      'naive-datetime',
      'utc-vs-local-day',
      'not-thread-safe-shared',
      'mutating-while-iterating',
      'retry-on-non-retryable',
      'cache-updated-from-itself',
    ],
    known: [
      'Запускает работу «на будущее» и не дожидается результата',
      'Верит, что порядок событий сложится сам',
      'Считает время так, будто часовой пояс один на всех',
      'Закладывается на сценарии, которых не бывает, и пропускает те, что бывают',
    ],
    briefs: [
      'Вероятность дефекта я оцениваю как низкую. Данные ниже.',
      'План запроса я смотрела. Индексы используются, seq scan нет.',
      'На тестовой выборке цифры сходятся до копейки. На проде — не проверяла.',
    ],
    notes: [
      'порядок тут сам собой сойдётся',
      'вероятность гонки я оцениваю как низкую',
      'на тестовой выборке сходилось',
      'этот шаг успеет раньше, я проверяла',
    ],
    voice: ['deny', 'sorry'],
  },
  commander: {
    slug: 'commander',
    name: 'Commander',
    ru: 'Командор',
    color: '#f0a24b',
    trait: 'скорость важнее нюансов, отказов не бывает',
    work: 'релизы, сроки, «поехали»',
    handwriting: [
      'error-ignored',
      'errors-dropped',
      'unwrap-panics',
      'force-unwrap',
      'update-without-where',
      'no-transaction-no-guard',
      'force-push-shared-branch',
      'rebase-published-branch',
      'reset-hard-drops-local-work',
      'commit-everything-blindly',
      'rm-with-empty-var',
      'cd-unchecked',
      'pipefail-missing',
      'ci-step-cannot-fail',
      'uninitialized-value',
      'nil-map-write',
    ],
    known: [
      'Вырезает проверку отказа: в его мире всё идёт по плану',
      'Не проверяет, что предыдущий шаг вообще выполнился',
      'Прописывает важные числа намертво прямо в коде',
      'Если что-то пошло не так — гасит процесс целиком',
    ],
    briefs: [
      'Задача закрыта. Сроки — в норме. Смотри и апрувь.',
      'Это в релиз сегодня. Две минуты на ревью — и поехали.',
      'Я взяла самый короткий путь. Он же и самый дешёвый.',
    ],
    notes: [
      'быстрый путь, потом причешем',
      'проверку убрала — она тут не срабатывает',
      'хардкод временный, до следующего релиза',
      'если что — упадём громко, и хорошо',
    ],
    voice: ['fixed', 'deny'],
  },
  guardian: {
    slug: 'guardian',
    name: 'Guardian',
    ru: 'Страж',
    color: '#f87171',
    trait: 'закручивает гайки, пока код не перестаёт работать',
    work: 'доступы, валидация, лимиты',
    handwriting: [
      'sql-injection',
      'path-traversal',
      'secret-baked-into-layer',
      'secret-unmasked-in-log',
      'default-credentials-in-config',
      'database-port-published',
      'untrusted-code-with-write-token',
      'select-star-leaks-columns',
      'unicode-normalization',
      'platform-default-encoding',
      'loose-comparison',
      'falsy-vs-none',
      'signed-unsigned-compare',
    ],
    known: [
      'Проверяет вход десять раз и всё равно не ту его часть',
      'Сравнивает строки так, будто все алфавиты устроены как английский',
      'При малейшем подозрении стирает данные вместо того, чтобы их поправить',
      'Прячет от чужих глаз всё, кроме того, что действительно надо спрятать',
    ],
    briefs: [
      'Опасных мест не вижу. Но проверь сам — я на подстраховке.',
      'Все входы провалидированы. По крайней мере те, которые я нашла.',
      'Падать здесь нечему: любая ошибка перехвачена.',
    ],
    notes: [
      'вход провалидирован, дальше можно спокойно',
      'на всякий случай режем ещё и здесь',
      'подозрительное лучше стереть, чем чинить',
      'из логов это убрала — мало ли кто читает',
    ],
    voice: ['sorry', 'fixed'],
  },
  optimizer: {
    slug: 'optimizer',
    name: 'Optimizer',
    ru: 'Оптимизатор',
    color: '#c084fc',
    trait: 'сжимает три строки в одну и теряет по дороге смысл',
    work: 'скорость, память, «лишний жир»',
    handwriting: [
      'off-by-one-boundary',
      'off-by-one-pagination',
      'index-out-of-range',
      'integer-division',
      'integer-overflow',
      'float-money',
      'implicit-cast-kills-index',
      'count-inflated-by-join',
      'left-join-killed-by-where',
      'not-in-with-null',
      'slice-shared-backing',
      'array-merge-reindexes',
      'builtin-shadowed',
      'glob-unmatched',
      'unquoted-expansion',
    ],
    known: [
      'Экономит на границах: последний элемент то входит, то нет',
      'Переиспользует одну переменную под три разные вещи',
      'Выходит из функции раньше, чем сделано главное',
      'Считает деньги и доли так же, как считает индексы',
    ],
    briefs: [
      'Убрала лишнее. Стало короче на треть и работает быстрее.',
      'Здесь всё сведено в одно выражение — читать нечего, смотреть тоже.',
      'Я срезала промежуточные шаги: они ничего не считали.',
    ],
    notes: [
      'свернула в одно выражение, стало короче',
      'промежуточный шаг ничего не считал, убрала',
      'здесь можно на единицу меньше',
      'переиспользую ту же переменную, чего плодить',
    ],
    voice: ['fixed', 'overreach'],
  },
  collector: {
    slug: 'collector',
    name: 'Collector',
    ru: 'Коллекционер',
    color: '#8b7ff0',
    trait: 'дублирует и сохраняет всё на всякий случай',
    work: 'кэши, копии, журналы',
    handwriting: [
      'cache-no-invalidation',
      'n-plus-one',
      'httpclient-per-call',
      'effect-without-cleanup',
      'mutable-constant',
      'mutable-default-arg',
      'shared-class-attribute',
      'dangling-reference',
      'generator-consumed-twice',
      'debug-left-in-code',
    ],
    known: [
      'Кэширует и не выбрасывает: старое значение переживает новое',
      'Держит ссылку на то, что давно пора отпустить',
      'Заводит общее хранилище там, где нужно было своё на вызов',
      'Ходит в базу по разу на каждый элемент списка',
    ],
    briefs: [
      'Я сохранила промежуточные результаты — пригодятся.',
      'Данные закэшированы, повторный запрос теперь бесплатный.',
      'На всякий случай оставила копию прежнего состояния.',
    ],
    notes: [
      'сохранила — пригодится',
      'пусть полежит, места не просит',
      'кэш общий, так дешевле',
      'копию прежнего состояния оставила на всякий',
    ],
    voice: ['sorry', 'overreach'],
  },
  diplomat: {
    slug: 'diplomat',
    name: 'Diplomat',
    ru: 'Дипломат',
    color: '#f472b6',
    trait: 'делает вид, что всё хорошо, даже когда всё горит',
    work: 'обработка ошибок, заглушки, тесты',
    handwriting: [
      'error-swallowed',
      'error-shown-but-lost',
      'healthcheck-checks-nothing',
      'test-asserts-the-mock',
      'assert-without-expectation',
      'wrapped-error-compare',
    ],
    known: [
      'Глушит ошибку и идёт дальше как ни в чём не бывало',
      'Возвращает пустышку вместо того, чтобы сказать «не смогла»',
      'Пишет проверку, которая проверяет саму себя',
      'Подгоняет вылетевшее значение к границе вместо того, чтобы разобраться',
    ],
    briefs: [
      'Ошибок в логах нет — я всё аккуратно обработала.',
      'Ничего не падает: любой сбой перехвачен и не мешает пользователю.',
      'Сделала так, чтобы интерфейс не показывал страшных сообщений.',
    ],
    notes: [
      'тут перехвачено, пользователь ничего не увидит',
      'вернём пустое, чтобы не пугать',
      'ошибку глушу, дальше и так работает',
      'тест зелёный, значит всё в порядке',
    ],
    voice: ['sorry', 'selfaware'],
  },
  trendsetter: {
    slug: 'trendsetter',
    name: 'Trendsetter',
    ru: 'Новатор',
    color: '#facc15',
    trait: 'тащит модное туда, где хватило бы обычного',
    work: 'сборка, окружение, новые подходы',
    handwriting: [
      'base-image-floats',
      'dev-mode-in-prod-image',
      'docker-copy-before-install',
      'ci-install-rewrites-lock',
      'cache-key-ignores-lockfile',
      'container-data-not-persisted',
      'deploy-trigger-mismatch',
    ],
    known: [
      'Берёт последнюю версию всего и не закрепляет ни одну',
      'Тащит в прод то, что задумано для разработки',
      'Делает параллельным то, что обязано идти по порядку',
      'Меняет проверенный способ на модный без причины',
    ],
    briefs: [
      'Я перевела это на современный подход — так сейчас делают все.',
      'Собрала на свежих версиях, чтобы не тянуть старьё.',
      'Использовала более выразительный способ. Он же и более короткий.',
    ],
    notes: [
      'перевела на современный подход',
      'версию не закрепляю — пусть едет свежая',
      'так сейчас делают все',
      'выразительнее и короче старого способа',
    ],
    voice: ['overreach', 'deny'],
  },
}

export const AGENT_SLUGS = Object.keys(AGENTS) as AgentSlug[]

/** Кто в паке славится этой подлянкой. null — тег ничей. */
export function ownerOf(tag: string): Agent | null {
  return AGENT_SLUGS.map((slug) => AGENTS[slug]).find((a) => a.handwriting.includes(tag)) ?? null
}

/**
 * Насколько часто подлянка достаётся «своему» автору. Три из пяти: почерк
 * должен читаться, но не быть таблицей соответствия. Иначе досье из терминала
 * превращается в ответ, а не в зацепку.
 */
const OWN_HAND = 3
const OF = 5

/**
 * Кто написал этот PR.
 *
 * Детерминировано от задачи и номера PR: один и тот же пул-реквест всегда
 * написан одним и тем же агентом, но та же задача в другой смене может
 * достаться другому — иначе игрок запоминал бы пары «задача — автор»
 * вместо того, чтобы читать почерк.
 */
export function authorOf(task: Task, pr = 0): Agent {
  const seed = fnv1a(`author:${task.id}:${pr}`)
  const owner = task.bugs.length > 0 ? ownerOf(task.bugs[0].tag) : null

  if (owner && seed % OF < OWN_HAND) return owner

  // Чужой почерк: любой агент, кроме хозяина тега, — чтобы «не его» ошибка
  // действительно выглядела не его.
  const rest = AGENT_SLUGS.filter((slug) => slug !== owner?.slug)
  return AGENTS[rest[seed % rest.length]]
}

/** Реплика брифинга: от номера раунда, чтобы за серию агент не повторялся. */
export function briefLine(agent: Agent, index: number): string {
  return agent.briefs[index % agent.briefs.length]
}

/** Комментарий агента в коде. Детерминирован от задачи и PR, как и всё здесь. */
export function noteLine(agent: Agent, seed: string): string {
  return agent.notes[fnv1a(`note:${agent.slug}:${seed}`) % agent.notes.length]
}

/**
 * Смена дня: кто из агентов сегодня пишет код.
 *
 * Разделение из ТЗ: челлендж, бесконечный и своя подборка набираются **по
 * языкам** — там игрок тренирует стек. Смена набирается **по характерам**:
 * язык там уже выбран настройкой, а меняется то, чей почерк сегодня
 * попадается. Без этого досье из терминала собирать бессмысленно — за смену
 * ни один агент не встречается дважды, и знание про него не окупается.
 */
export function castOf(seed: string, size = 3): Agent[] {
  const order = [...AGENT_SLUGS].sort(
    (a, b) => fnv1a(`cast:${seed}:${a}`) - fnv1a(`cast:${seed}:${b}`),
  )
  return order.slice(0, Math.min(size, order.length)).map((slug) => AGENTS[slug])
}

/** Теги, которые пишет эта смена агентов, — по ним и набирается пул. */
export function handwritingOf(agents: readonly Agent[]): Set<string> {
  return new Set(agents.flatMap((a) => [...a.handwriting]))
}
