import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_REPO, normalizeRepo, PR_BASE, prScope, pullRequest } from './pr.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

test('заголовок собирается из запроса и файла задачи', () => {
  for (const task of PACK) {
    const pr = pullRequest(task, PR_BASE, DEFAULT_REPO)

    assert.match(pr.title, /^(feat|fix|perf|refactor|test|chore)\([\w.-]+\): .+/, task.id)
    assert.ok(pr.scope.length > 0, `${task.id}: пустая область`)
    assert.ok(pr.files >= 1, `${task.id}: ни одного файла в дифе`)
  }
})

test('область берётся из файла, который увидит игрок', () => {
  const task = PACK.find((t) => t.id === 'sql-boundary-001')
  if (task) assert.equal(prScope(task), 'report')
})

test('область всегда в нижнем регистре и через дефис', () => {
  for (const task of PACK) {
    assert.equal(prScope(task), prScope(task).toLowerCase(), task.id)
    assert.doesNotMatch(prScope(task), /[\s_]/, task.id)
  }
})

test('имя репозитория чистится, но не пропадает', () => {
  assert.equal(normalizeRepo('  raspiz/vet-crm  '), 'raspiz/vet-crm')
  assert.equal(normalizeRepo('https://github.com/raspiz/vet-crm.git'), 'raspiz/vet-crm')
  assert.equal(normalizeRepo('моя команда/крутой проект'), 'моя-команда/крутой-проект')
  assert.equal(normalizeRepo('   '), DEFAULT_REPO)
  assert.equal(normalizeRepo('/'), DEFAULT_REPO)
  assert.ok(normalizeRepo('a'.repeat(200)).length <= 40)
})
