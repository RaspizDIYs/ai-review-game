/**
 * Подсветка одной задачи. В `pack.json` её нет намеренно: токены — три четверти
 * веса пака, а нужны только для той задачи, что сейчас на экране
 * (см. `scripts/build-pack.mjs`).
 *
 * Не загрузилась — диф рисуется обычным текстом, играть это не мешает.
 */

import type { Task } from './types'

type Tokens = NonNullable<Task['tokens']>

const files = import.meta.glob<{ default: Tokens }>('./content/tokens/*.json')

export async function loadTokens(id: string): Promise<Tokens | undefined> {
  const load = files[`./content/tokens/${id}.json`]
  if (!load) return undefined

  try {
    return (await load()).default
  } catch {
    return undefined
  }
}
