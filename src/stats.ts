/**
 * Агрегат по всем игрокам: сколько людей нашло эту подлянку и как игрок
 * выглядит на общем фоне.
 *
 * Читается один статический JSON, который сервер пересобирает по расписанию.
 * Никакого лидерборда: он потребовал бы идентификатор игрока, а мы намеренно
 * не заводим ни кук, ни аккаунтов. Сравнение с распределением даёт то же
 * приятное чувство и ничего про человека не знает.
 *
 * Нет сети, нет данных, мало выборки — просто ничего не показываем.
 */

const URL_ = import.meta.env.VITE_METRICS_URL

export interface Stats {
  tasks: Record<string, { n: number; found: number }>
  dailyWinShares: number[]
}

let cache: Stats | null = null

export async function loadStats(): Promise<Stats | null> {
  if (!URL_) return null
  if (cache) return cache

  try {
    // /e — приём событий, /stats.json лежит рядом.
    const res = await fetch(new URL('stats.json', URL_), { cache: 'no-store' })
    if (!res.ok) return null

    cache = (await res.json()) as Stats
    return cache
  } catch {
    return null
  }
}

/** «Эту подлянку нашли N%» вместе с размером выборки — null, если данных мало. */
export function foundShare(
  stats: Stats | null,
  taskId: string,
): { found: number; n: number } | null {
  const t = stats?.tasks[taskId]
  return t ? { found: t.found, n: t.n } : null
}

/** Ниже этого числа показываем выборку рядом с процентом — чтобы он не врал. */
export const THIN_SAMPLE = 10

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/**
 * Доля сыгравших, у кого результат хуже. Считается по распределению,
 * а не по рейтингу: сравниваем с тем, как справились люди, а не с людьми.
 */
export function betterThan(
  stats: Stats | null,
  wins: number,
  rounds: number,
): { pct: number; n: number } | null {
  const all = stats?.dailyWinShares
  if (!all?.length || rounds === 0) return null

  const mine = (wins / rounds) * 100
  const worse = all.filter((x) => x < mine).length

  return { pct: Math.round((worse / all.length) * 100), n: all.length }
}
