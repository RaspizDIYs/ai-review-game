/**
 * Заготовка новой задачи.
 *
 *   node scripts/new-task.mjs js race-condition 4
 *
 * Создаёт content/tasks/<id>.json с полями, заполненными подсказками TODO,
 * и сразу подставляет свободный номер, если такая тема уже бралась.
 * Дальше — шесть шагов из content/README.md.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'

const [stack, topic, difficulty] = process.argv.slice(2)

if (!['js', 'py', 'sql'].includes(stack) || !topic || !/^[1-5]$/.test(difficulty ?? '')) {
  console.error('node scripts/new-task.mjs <js|py|sql> <тема-кебабом> <сложность 1-5>')
  process.exit(1)
}

const SRC = new URL('../content/tasks/', import.meta.url)

let n = 1
let id = ''
do {
  id = `${stack}-${topic}-${String(n).padStart(3, '0')}`
  n++
} while (existsSync(new URL(`${id}.json`, SRC)))

const EXAMPLE = {
  js: {
    file: 'src/example.ts',
    diff: `--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,3 +1,6 @@\n TODO: контекст\n+TODO: добавленная строка\n+TODO: строка с подлянкой\n`,
    tests: 'PASS  src/example.test.ts (3)\n  ✓ TODO\n\nTests  3 passed (3)',
  },
  py: {
    file: 'example.py',
    diff: `--- a/example.py\n+++ b/example.py\n@@ -1,3 +1,6 @@\n TODO: контекст\n+TODO: добавленная строка\n+TODO: строка с подлянкой\n`,
    tests: '==== test session starts ====\ncollected 4 items\n\ntests/test_example.py ....\n\n==== 4 passed in 0.2s ====',
  },
  sql: {
    file: 'src/example.sql',
    diff: `--- a/src/example.sql\n+++ b/src/example.sql\n@@ -1,3 +1,5 @@\n SELECT TODO\n+FROM TODO\n+WHERE TODO\n`,
    tests: 'PASS  tests/example.test.ts (4)\n  ✓ TODO\n\nTests  4 passed (4)',
  },
}[stack]

const skeleton = {
  id,
  stack,
  difficulty: Number(difficulty),
  title: 'TODO: короткое название, как в задаче на спринт',
  prompt: 'TODO: что попросили у ИИ, живым языком — так, как просят в реальности',
  tests: EXAMPLE.tests,
  diff: EXAMPLE.diff,
  clean: false,
  bugs: [
    {
      file: EXAMPLE.file,
      match: 'TODO: строка с подлянкой',
      kind: 'wrong',
      tag: 'TODO: тег-кебабом',
      explain: 'TODO: что здесь не так',
      consequence:
        'TODO: что сломается, у кого и когда. Конкретно — «будут проблемы» не годится',
    },
  ],
  decoys: [
    {
      match: 'TODO: добавленная строка',
      why: 'TODO: почему к ней справедливо придраться и почему это всё-таки не она',
    },
  ],
  verified_by: '',
  verified_at: '',
}

writeFileSync(new URL(`${id}.json`, SRC), JSON.stringify(skeleton, null, 2) + '\n')

console.log(`✓ content/tasks/${id}.json

Дальше:
  1. заполни diff, prompt и зелёный прогон тестов
  2. проверь себя: одной фразой — почему зелёный тест врёт?
  3. npm run check
  4. отдай второму человеку и проставь verified_by

Черновик через модель: node scripts/draft-task.mjs ${stack} ${topic} ${difficulty}
Правила и грабли: content/README.md`)
