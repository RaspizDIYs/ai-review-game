/**
 * Портреты агентов нарисованы «кругом внутри квадрата»: диск с рисунком
 * не совпадает с границей файла — он смещён на несколько пикселей и обведён
 * тёмным кольцом. В интерфейсе аватар обрезается своим кругом, и это
 * расхождение видно как чёрный серп сбоку: портрет стоит в рамке криво.
 *
 * Скрипт находит настоящий круг на картинке и вырезает описанный вокруг него
 * квадрат. После этого вписанная окружность файла и есть рисунок, а круглая
 * маска в вёрстке садится на него ровно.
 *
 * Оригиналы лежат в content/agents и не меняются — сюда можно положить новый
 * портрет и прогнать `npm run avatars` ещё раз.
 */

import sharp from 'sharp'
import { mkdirSync, readdirSync } from 'node:fs'

const SRC = 'content/agents'
const OUT = 'public/agents'
const SIZE = 512
/** Кольцо по краю диска слегка размыто — срезаем полтора процента радиуса. */
const TRIM = 0.985
/** Ниже этого — тёмная рамка вокруг диска, выше — сам рисунок. */
const INK = 60

/** Алгебраическая подгонка окружности по методу Касы: x²+y²+Dx+Ey+F=0. */
function fitCircle(points) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0
  for (const [x, y] of points) {
    const z = x * x + y * y
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
    sz += z; sxz += x * z; syz += y * z
  }

  const m = [
    [sxx, sxy, sx, -sxz],
    [sxy, syy, sy, -syz],
    [sx, sy, points.length, -sz],
  ]

  for (let i = 0; i < 3; i++) {
    let p = i
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k
    ;[m[i], m[p]] = [m[p], m[i]]
    for (let k = 0; k < 3; k++) {
      if (k === i) continue
      const f = m[k][i] / m[i][i]
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]
    }
  }

  const cx = -(m[0][3] / m[0][0]) / 2
  const cy = -(m[1][3] / m[1][1]) / 2
  return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - m[2][3] / m[2][2]) }
}

/**
 * Точки на границе диска. Берём только верхнюю половину: там фон портрета
 * светлый, и край читается однозначно. Внизу у всех тёмная одежда — она
 * сливается с рамкой и увела бы окружность вверх.
 */
function edgePoints(data, W, H, ch) {
  const lum = (x, y) => {
    const i = (y * W + x) * ch
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const pts = []
  for (let y = 2; y < Math.floor(H * 0.5); y += 2) {
    let l = -1
    let r = -1
    for (let x = 0; x < W; x++) {
      if (lum(x, y) <= INK) continue
      if (l < 0) l = x
      r = x
    }
    if (l < 0) continue
    // Точки на самом краю файла — это обрезанный диск, а не его граница.
    if (l > 0) pts.push([l, y])
    if (r < W - 1) pts.push([r, y])
  }
  return pts
}

mkdirSync(OUT, { recursive: true })

for (const file of readdirSync(SRC).filter((n) => n.endsWith('.png'))) {
  const img = sharp(`${SRC}/${file}`)
  const { width: W, height: H } = await img.metadata()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })

  const pts = edgePoints(data, W, H, info.channels)
  if (pts.length < 30) {
    console.log(`${file}: круг не найден, копируем как есть`)
    await img.resize(SIZE, SIZE, { fit: 'cover' }).png().toFile(`${OUT}/${file}`)
    continue
  }

  const { cx, cy, r } = fitCircle(pts)
  const rr = r * TRIM
  // Квадрат не может выйти за файл: иначе на краю круга появится пустота.
  const half = Math.min(rr, cx, cy, W - cx, H - cy)
  const left = Math.round(cx - half)
  const top = Math.round(cy - half)
  const side = Math.max(1, Math.round(half * 2))

  await sharp(`${SRC}/${file}`)
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`)

  console.log(
    `${file}: центр ${cx.toFixed(1)},${cy.toFixed(1)} радиус ${r.toFixed(1)} → ${left},${top} ${side}px`,
  )
}
