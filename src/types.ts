/** Формат контента. Синхронизирован с заметкой «Формат задачи — Ревью за ИИ». */

export type Stack = 'js' | 'py' | 'sql'

/** 1..5, см. таблицу сложностей в ТЗ. */
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Bug {
  file: string
  /** Номер строки в НОВОЙ версии файла. */
  line: number
  /**
   * `missing` — кода не хватает, засчитывается клик по line ±1.
   * `wrong` — код на этой строке неверен, только точное попадание.
   */
  kind: 'missing' | 'wrong'
  /** Тег из «Колоды подлянок ИИ в коде». */
  tag: string
  explain: string
  /** Что сломается, у кого и когда. Важнее, чем explain. */
  consequence: string
}

export interface Decoy {
  line: number
  why: string
}

export interface Task {
  id: string
  stack: Stack
  difficulty: Difficulty
  title: string
  /** Что «попросили у ИИ» — живым языком. */
  prompt: string
  /** Вывод прогона тестов. Всегда зелёный. */
  tests: string
  /** Unified diff. */
  diff: string
  /** true — подлянки нет, правильный ответ «здесь чисто». */
  clean: boolean
  bugs: Bug[]
  decoys: Decoy[]
  verified_by: string
  verified_at: string
  /**
   * Подсветка, разложенная сборкой пака по индексам строк из parseDiff:
   * [текст, цвет]. null — строку подсвечивать нечем (заголовок файла, @@).
   */
  tokens?: (([string, string])[] | null)[]
}

/** Чем закончился раунд. Живёт здесь, а не в компоненте: от него зависят
 *  подсчёт очков, сохранение и строка шеринга. */
export type Outcome = 'found' | 'missed' | 'clean-correct' | 'false-accusation'
