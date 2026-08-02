import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDiff, isClickable } from './diff.ts'

const SAMPLE = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 a
-b
+B
+c
 d
`

test('нумерация новых строк идёт подряд и не сбивается на удалённых', () => {
  const lines = parseDiff(SAMPLE)
  const nums = lines.filter((l) => l.newNo !== null).map((l) => l.newNo)
  assert.deepEqual(nums, [1, 2, 3, 4])
})

test('удалённая строка не имеет номера в новой версии и не кликается', () => {
  const del = parseDiff(SAMPLE).find((l) => l.kind === 'del')!
  assert.equal(del.newNo, null)
  assert.equal(isClickable(del), false)
})

test('старая нумерация пропускает добавленные строки', () => {
  const lines = parseDiff(SAMPLE)
  assert.deepEqual(
    lines.filter((l) => l.oldNo !== null).map((l) => l.oldNo),
    [1, 2, 3],
  )
})

test('пустая строка контекста не теряется', () => {
  const lines = parseDiff('--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n x\n\n y\n')
  assert.deepEqual(
    lines.filter((l) => l.newNo !== null).map((l) => l.newNo),
    [1, 2, 3],
  )
})

test('хвостовой перевод строки не создаёт лишнюю строку', () => {
  assert.equal(parseDiff(SAMPLE).length, parseDiff(SAMPLE.trimEnd()).length)
})

test('маркеры файла и ханка не кликаются', () => {
  for (const l of parseDiff(SAMPLE).filter((l) => l.kind === 'file' || l.kind === 'hunk')) {
    assert.equal(isClickable(l), false)
  }
})
