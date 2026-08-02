/**
 * Разбор unified diff. Своё, а не библиотека — нужен клик по конкретной строке
 * и её номер в новой версии файла.
 */

export type DiffLineKind = 'file' | 'hunk' | 'context' | 'add' | 'del'

export interface DiffLine {
  kind: DiffLineKind
  /** Номер в старой версии, если строка там есть. */
  oldNo: number | null
  /** Номер в новой версии. По нему размечены подлянки. */
  newNo: number | null
  /** Текст без ведущего маркера. */
  text: string
  /** Индекс в массиве — стабильный ключ для React. */
  index: number
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function parseDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0

  // Хвостовой перевод строки убираем до split, иначе последним элементом
  // приезжает пустая строка и её не отличить от пустой строки контекста.
  for (const raw of diff.replace(/\n$/, '').split('\n')) {
    const push = (kind: DiffLineKind, o: number | null, n: number | null, text: string) =>
      out.push({ kind, oldNo: o, newNo: n, text, index: out.length })

    if (raw.startsWith('--- ') || raw.startsWith('+++ ')) {
      push('file', null, null, raw)
      continue
    }

    const hunk = HUNK.exec(raw)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      push('hunk', null, null, raw)
      continue
    }

    // До первого @@ нумерации ещё нет — такие строки просто пропускаем.
    if (out.length === 0) continue

    if (raw.startsWith('+')) {
      push('add', null, newNo, raw.slice(1))
      newNo++
    } else if (raw.startsWith('-')) {
      push('del', oldNo, null, raw.slice(1))
      oldNo++
    } else {
      // Строка контекста. Пустая строка файла в дифе — это ' ', но руками
      // её часто пишут как '', поэтому принимаем оба варианта.
      push('context', oldNo, newNo, raw.startsWith(' ') ? raw.slice(1) : raw)
      oldNo++
      newNo++
    }
  }

  return out
}

/**
 * Кликать можно только по строкам, существующим в новой версии файла:
 * подлянка всегда размечена номером новой строки, а удалённых строк там нет.
 */
export function isClickable(line: DiffLine): boolean {
  return line.newNo !== null
}
