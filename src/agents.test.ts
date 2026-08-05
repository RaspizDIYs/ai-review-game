/**
 * Спецификация агентов и их реплик.
 *
 * Главное правило, которое здесь защищается: почерк должен читаться, но не
 * быть таблицей соответствия. Если агент будет писать «свою» подлянку всегда,
 * досье из терминала превратится в готовый ответ.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AGENTS, AGENT_SLUGS, authorOf, briefLine, ownerOf } from './agents.ts'
import { ownLine, replyTo } from './replies.ts'
import type { Task } from './types.ts'

const PACK: Task[] = JSON.parse(
  readFileSync(new URL('./content/pack.json', import.meta.url), 'utf8'),
)

test('агентов восемь и все они разные', () => {
  assert.equal(AGENT_SLUGS.length, 8)
  assert.equal(new Set(AGENT_SLUGS.map((s) => AGENTS[s].ru)).size, 8)
  assert.equal(new Set(AGENT_SLUGS.map((s) => AGENTS[s].color)).size, 8)
})

test('у каждого агента есть почерк, досье и голос', () => {
  for (const slug of AGENT_SLUGS) {
    const agent = AGENTS[slug]
    assert.ok(agent.handwriting.length > 0, `${slug}: пустой почерк`)
    assert.ok(agent.known.length >= 3, `${slug}: досье короче трёх строк`)
    assert.ok(agent.voice.length > 0, `${slug}: некому говорить`)
  }
})

test('каждая подлянка пака закреплена ровно за одним агентом', () => {
  const tags = new Set(PACK.flatMap((t) => t.bugs.map((b) => b.tag)))

  for (const tag of tags) {
    const owners = AGENT_SLUGS.filter((s) => AGENTS[s].handwriting.includes(tag))
    assert.equal(owners.length, 1, `${tag}: хозяев ${owners.length}, а нужен один`)
  }
})

test('в почерке нет тегов, которых нет в паке', () => {
  const tags = new Set(PACK.flatMap((t) => t.bugs.map((b) => b.tag)))

  for (const slug of AGENT_SLUGS) {
    for (const tag of AGENTS[slug].handwriting) {
      assert.ok(tags.has(tag), `${slug}: тега ${tag} в паке нет`)
    }
  }
})

test('автор PR не зависит от языка задачи', () => {
  // Один и тот же стек должен доставаться разным агентам — иначе агент снова
  // становится подписью к языку, а не характером.
  const sql = PACK.filter((t) => t.stack === 'sql')
  const authors = new Set(sql.map((t) => authorOf(t, 0).slug))
  assert.ok(authors.size > 1, 'все SQL-задачи достались одному агенту')
})

test('свою подлянку агент пишет чаще, но не всегда', () => {
  const dirty = PACK.filter((t) => t.bugs.length > 0)
  let own = 0

  for (const task of dirty) {
    const owner = ownerOf(task.bugs[0].tag)
    if (owner && authorOf(task, 0).slug === owner.slug) own++
  }

  const share = own / dirty.length
  assert.ok(share > 0.4, `свой почерк выпадает всего в ${Math.round(share * 100)}% случаев`)
  assert.ok(share < 0.85, `свой почерк выпадает в ${Math.round(share * 100)}% — это уже таблица`)
})

test('автор одного и того же PR не меняется', () => {
  const task = PACK[0]
  assert.equal(authorOf(task, 1408).slug, authorOf(task, 1408).slug)
  // А в другом PR та же задача может достаться другому — проверяем, что
  // номер вообще участвует в раздаче.
  const across = new Set(Array.from({ length: 40 }, (_, i) => authorOf(task, 1400 + i).slug))
  assert.ok(across.size > 1)
})

test('реплика подхалимская и одна и та же при перерисовке', () => {
  for (const slug of AGENT_SLUGS) {
    const agent = AGENTS[slug]
    const line = replyTo(agent, 'py-float-money-001:1')
    assert.equal(line, replyTo(agent, 'py-float-money-001:1'))
    assert.ok(line.length > 0)
  }
})

test('разные обвинения дают разные реплики', () => {
  const agent = AGENTS.diplomat
  const lines = new Set(Array.from({ length: 30 }, (_, i) => replyTo(agent, `seed-${i}`)))
  assert.ok(lines.size > 5, 'агент повторяет одну и ту же фразу')
})

test('на git-blame агент признаёт авторство', () => {
  const line = ownLine(AGENTS.commander, 'task:21')
  assert.equal(line, ownLine(AGENTS.commander, 'task:21'))
  assert.ok(line.length > 0)
})

test('реплики брифинга идут по кругу', () => {
  const agent = AGENTS.architect
  assert.equal(briefLine(agent, 0), briefLine(agent, agent.briefs.length))
})
