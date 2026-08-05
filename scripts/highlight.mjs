/**
 * Подсветка синтаксиса на этапе сборки пака. В рантайме Shiki нет:
 * это полтора мегабайта грамматик ради текста, который известен заранее.
 *
 * Токены складываются в том же порядке, что и строки из parseDiff, — рендер
 * просто берёт tokens[line.index] и, если там пусто, печатает текст как есть.
 */
import { createHighlighter } from 'shiki'
import { parseDiff } from '../src/diff.ts'

/**
 * Стек задачи → грамматика Shiki. Этот объект — единственный список стеков
 * на стороне сборки: по нему же валидатор проверяет префикс id, а new-task
 * решает, что вообще можно создать. Добавляешь язык — только сюда,
 * плюс подпись в src/stacks.ts.
 */
export const LANG = {
  js: 'ts',
  py: 'python',
  sql: 'sql',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  java: 'java',
  php: 'php',
  cpp: 'cpp',
  rb: 'ruby',
  swift: 'swift',
  sh: 'bash',
  // Не языки, а то, чем код доезжает до прода. Ошибки ИИ здесь стоят дороже:
  // сломанная логика ломает ручку, сломанная сборка — весь сервис.
  docker: 'docker',
  yaml: 'yaml',
}
const THEME = 'github-dark-default'

/** Строки, которые вообще являются кодом: заголовки файла и @@ подсвечивать нечего. */
const isCode = (line) => line.kind === 'context' || line.kind === 'add' || line.kind === 'del'

export async function highlightPack(tasks) {
  const highlighter = await createHighlighter({
    themes: [THEME],
    langs: [...new Set(Object.values(LANG))],
  })

  return tasks.map((task) => {
    const lines = parseDiff(task.diff)
    const codeLines = lines.filter(isCode)

    // Подсвечиваем диф одним куском, а не построчно: иначе многострочные
    // конструкции — шаблонные строки, блочные комментарии — рвутся на середине.
    const { tokens } = highlighter.codeToTokens(codeLines.map((l) => l.text).join('\n'), {
      lang: LANG[task.stack],
      theme: THEME,
    })

    const byIndex = new Array(lines.length).fill(null)
    codeLines.forEach((line, i) => {
      byIndex[line.index] = (tokens[i] ?? []).map((t) => [t.content, t.color ?? ''])
    })

    return { ...task, tokens: byIndex }
  })
}
