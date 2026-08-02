/**
 * Картинка для превью ссылки. Рендерится из SVG в PNG на этапе сборки:
 * Telegram и Twitter SVG в og:image не показывают.
 *
 *   node scripts/build-og.mjs
 */
import sharp from 'sharp'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#09090b"/>
  <rect x="80" y="150" width="1040" height="330" rx="16" fill="#18181b" stroke="#27272a"/>

  <g font-family="ui-monospace, Menlo, monospace" font-size="26">
    <text x="120" y="205" fill="#3f3f46">14</text>
    <text x="190" y="205" fill="#a1a1aa">  const user = await db.users.findById(id)</text>

    <text x="120" y="250" fill="#3f3f46">15</text>
    <text x="190" y="250" fill="#a1a1aa">  cache.set(id, user)</text>

    <text x="120" y="295" fill="#3f3f46">16</text>
    <text x="190" y="295" fill="#a1a1aa">  return user</text>

    <rect x="100" y="315" width="1000" height="46" fill="#450a0a"/>
    <text x="120" y="348" fill="#71717a">18</text>
    <text x="160" y="348" fill="#4ade80">+</text>
    <text x="190" y="348" fill="#fca5a5">  await db.users.update(id, patch)</text>

    <text x="120" y="400" fill="#3f3f46">19</text>
    <text x="190" y="400" fill="#a1a1aa">}</text>
  </g>

  <text x="80" y="105" font-family="system-ui, sans-serif" font-size="56" font-weight="600" fill="#fafafa">Ревью за ИИ</text>
  <text x="80" y="545" font-family="system-ui, sans-serif" font-size="30" fill="#a1a1aa">Тесты зелёные. Найди, где тебя обманули — за 90 секунд.</text>
  <text x="80" y="590" font-family="system-ui, sans-serif" font-size="24" fill="#52525b">Новый челлендж каждый день</text>
</svg>`

await sharp(Buffer.from(svg)).png().toFile(new URL('../public/og.png', import.meta.url).pathname)
console.log('✓ public/og.png')
