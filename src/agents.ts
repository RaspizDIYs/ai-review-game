/**
 * ИИ-агенты: те, кто «написал» код, который ты ревьюишь.
 *
 * Смысл не в украшении. Игра про недоверие к уверенной машине, и уверенность
 * должна звучать голосом: агент говорит, что всё проверил, и ошибается.
 * Цвет агента становится акцентом интерфейса на весь раунд — так экран
 * помнит, с кем ты сейчас имеешь дело.
 *
 * Портреты кладутся в `public/agents/<slug>.png`. Нет файла — рисуется
 * монограмма в цвет агента, интерфейс от этого не разъезжается.
 */

import type { Outcome, Stack } from './types'

export type AgentSlug = 'architect' | 'commander' | 'oracle' | 'guardian'

export interface Agent {
  slug: AgentSlug
  name: string
  ru: string
  color: string
  lang: string
  work: string
  /** Что говорит на брифинге — по кругу, чтобы не повторяться в серии. */
  briefs: string[]
  after: Record<Outcome, string>
}

export const AGENTS: Record<AgentSlug, Agent> = {
  architect: {
    slug: 'architect',
    name: 'Architect',
    ru: 'Архитектор',
    color: '#38bdf8',
    lang: 'C# / .NET',
    work: 'сервисы, слои, схемы',
    briefs: [
      'Структура продумана на два шага вперёд. Компонент делает ровно то, что просили.',
      'Слои разделены, зависимости идут в одну сторону. Смотреть особо нечего.',
      'Я закладывала это под рост. Сейчас выглядит избыточно — через полгода не будет.',
    ],
    after: {
      found: 'Принято. Один слой абстракции я всё-таки срезал.',
      partial: 'Ты зацепил не всё, но направление верное.',
      missed: 'Значит, решение согласовано. Дальше — по плану.',
      'clean-correct': 'Спокойно. Так и должно было выглядеть.',
      'false-accusation': 'Эта строка держит конструкцию. Убирать её не нужно.',
    },
  },
  commander: {
    slug: 'commander',
    name: 'Commander',
    ru: 'Координатор',
    color: '#f5c451',
    lang: 'JavaScript / TypeScript',
    work: 'фичи, релизы, приоритеты',
    briefs: [
      'Задача закрыта. Сроки — в норме. Смотри и апрувь.',
      'Это в релиз сегодня. Две минуты на ревью — и поехали.',
      'Я взяла самый короткий путь. Он же и самый дешёвый.',
    ],
    after: {
      found: 'Признаю. Перераспределю внимание.',
      partial: 'Ты зацепил не всё, но направление верное.',
      missed: 'Отлично. Идём дальше.',
      'clean-correct': 'Верное решение. Так держать.',
      'false-accusation': 'Ты только что заблокировал свою же поставку.',
    },
  },
  oracle: {
    slug: 'oracle',
    name: 'Oracle',
    ru: 'Аналитик',
    color: '#2dd4bf',
    lang: 'SQL / базы данных',
    work: 'запросы, витрины, отчёты',
    briefs: [
      'Вероятность дефекта я оцениваю как низкую. Данные ниже.',
      'План запроса я смотрела. Индексы используются, seq scan нет.',
      'На тестовой выборке цифры сходятся до копейки. На проде — не проверяла.',
    ],
    after: {
      found: 'Моя оценка была смещена. Учту.',
      partial: 'Ты зацепил не всё, но направление верное.',
      missed: 'Как и прогнозировалось — прошло.',
      'clean-correct': 'Твоя оценка совпала с моей.',
      'false-accusation': 'Ложноположительное срабатывание. Бывает.',
    },
  },
  guardian: {
    slug: 'guardian',
    name: 'Guardian',
    ru: 'Защитник',
    color: '#f87171',
    lang: 'Python / безопасность',
    work: 'валидация, доступы, лимиты',
    briefs: [
      'Опасных мест не вижу. Но проверь сам — я на подстраховке.',
      'Все входы провалидированы. По крайней мере те, которые я нашла.',
      'Падать здесь нечему: любая ошибка перехвачена.',
    ],
    after: {
      found: 'Хорошо. Периметр держим вместе.',
      partial: 'Ты зацепил не всё, но направление верное.',
      missed: 'Предупреждение я не выдала. Виновата.',
      'clean-correct': 'Правильно. Лишний блок никого не защищает.',
      'false-accusation': 'Осторожность — это хорошо. Но не здесь.',
    },
  },
}

export const AGENT_SLUGS = Object.keys(AGENTS) as AgentSlug[]

/**
 * Кто пишет на каком стеке. Раздача не случайная: агент должен объяснять
 * именно тот код, который игрок видит, иначе реплика звучит мимо.
 */
const BY_STACK: Record<Stack, AgentSlug> = {
  js: 'commander',
  php: 'commander',
  rb: 'commander',
  swift: 'commander',
  py: 'guardian',
  sh: 'guardian',
  sql: 'oracle',
  cs: 'architect',
  java: 'architect',
  go: 'architect',
  rs: 'architect',
  cpp: 'architect',
}

export function agentFor(stack: Stack): Agent {
  return AGENTS[BY_STACK[stack] ?? 'commander']
}

/** Реплика брифинга: от номера раунда, чтобы за серию агент не повторялся. */
export function briefLine(agent: Agent, index: number): string {
  return agent.briefs[index % agent.briefs.length]
}
