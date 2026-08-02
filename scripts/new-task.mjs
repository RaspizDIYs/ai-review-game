/**
 * Заготовка новой задачи.
 *
 *   node scripts/new-task.mjs js race-condition 4
 *
 * Создаёт content/tasks/<id>.json с полями, заполненными подсказками TODO,
 * и сразу подставляет свободный номер, если такая тема уже бралась.
 * Дальше — шесть шагов из content/README.md.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { LANG } from './highlight.mjs'

const STACKS = Object.keys(LANG)
const [stack, topic, difficulty] = process.argv.slice(2)

if (!STACKS.includes(stack) || !topic || !/^[1-5]$/.test(difficulty ?? '')) {
  console.error(`node scripts/new-task.mjs <${STACKS.join('|')}> <тема-кебабом> <сложность 1-5>`)
  process.exit(1)
}

const SRC = new URL('../content/tasks/', import.meta.url)

let n = 1
let id = ''
do {
  id = `${stack}-${topic}-${String(n).padStart(3, '0')}`
  n++
} while (existsSync(new URL(`${id}.json`, SRC)))

/** Файл-пример и правдоподобный зелёный прогон для каждого стека. */
const TEMPLATE = {
  js: ['src/example.ts', 'PASS  src/example.test.ts (3)\n  ✓ TODO\n\nTests  3 passed (3)'],
  py: [
    'example.py',
    '==== test session starts ====\ncollected 4 items\n\ntests/test_example.py ....\n\n==== 4 passed in 0.2s ====',
  ],
  sql: ['src/example.sql', 'PASS  tests/example.test.ts (4)\n  ✓ TODO\n\nTests  4 passed (4)'],
  cs: [
    'src/Example.cs',
    'Passed!  - Failed: 0, Passed: 6, Skipped: 0, Total: 6, Duration: 41 ms',
  ],
  go: ['internal/example/example.go', 'ok  \texample/internal/example\t0.012s'],
  rs: [
    'src/example.rs',
    'running 4 tests\ntest example::tests::works ... ok\n\ntest result: ok. 4 passed; 0 failed',
  ],
  java: [
    'src/main/java/Example.java',
    'Tests run: 5, Failures: 0, Errors: 0, Skipped: 0\nBUILD SUCCESS',
  ],
  php: ['src/Example.php', 'PHPUnit 11.2.0\n\n....                      4 / 4 (100%)\n\nOK (4 tests, 6 assertions)'],
  cpp: ['src/example.cpp', '[==========] 4 tests from 1 test suite ran.\n[  PASSED  ] 4 tests.'],
  rb: ['lib/example.rb', '....\n\nFinished in 0.021 seconds\n4 examples, 0 failures'],
  swift: [
    'Sources/Example/Example.swift',
    "Test Suite 'All tests' passed at 2026-08-02 12:00:00.\n\t Executed 4 tests, with 0 failures",
  ],
  sh: ['scripts/example.sh', 'ok 4 - TODO\n\n1..4\n# tests 4\n# pass  4\n# fail  0'],
}[stack]

const EXAMPLE = {
  file: TEMPLATE[0],
  tests: TEMPLATE[1],
  diff:
    `--- a/${TEMPLATE[0]}\n+++ b/${TEMPLATE[0]}\n@@ -1,3 +1,6 @@\n` +
    ` TODO: контекст\n+TODO: добавленная строка\n+TODO: строка с подлянкой\n`,
}

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
