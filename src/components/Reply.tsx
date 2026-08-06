/**
 * Ответ ИИ на обвинение.
 *
 * Всплывает после отправки — и всегда одинаково подобострастно, прав игрок
 * или нет. Именно поэтому плашку можно показывать даже в слепой смене:
 * информации в ней ровно ноль, а смеха достаточно.
 *
 * Живёт в правом нижнем углу и выглядит репликой в чате, а не системным
 * сообщением. Сверху по центру она перекрывала шапку раунда — шкалы прода,
 * счётчик ходов и заголовок PR, то есть ровно то, на что игрок смотрит
 * сразу после отправки.
 *
 * См. заметку «Дополнительные идеи - Ревью за ии», часть 1.
 */

import type { Agent } from '../agents.ts'
import { AgentAvatar } from '../ui/kit.tsx'

export function Reply({
  agent,
  line,
  anonymous = false,
  accent,
}: {
  agent: Agent
  line: string
  /** В смене автор неизвестен: подписывать реплику именем нельзя. */
  anonymous?: boolean
  accent: string
}) {
  const color = anonymous ? accent : agent.color
  const name = anonymous ? 'ai' : agent.name

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-60 w-[min(380px,calc(100vw-32px))]"
      style={{ animation: 'replyIn .4s cubic-bezier(.2,1.3,.4,1) both' }}
      role="status"
    >
      <div
        // Хвостик у нижнего правого угла — это реплика, а не уведомление.
        className="flex items-center gap-3 rounded-xl rounded-br-sm px-4 py-3"
        style={{
          border: `1px solid ${color}66`,
          background: `linear-gradient(180deg, ${color}1f, #141420)`,
          boxShadow: '0 18px 40px rgba(0,0,0,.55)',
        }}
      >
        <AgentAvatar
          slug={anonymous ? null : agent.slug}
          name={anonymous ? '?' : name}
          color={color}
          size={38}
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[10px] tracking-[.16em] uppercase" style={{ color }}>
            {name}
          </span>
          <span className="text-sm leading-[1.4] text-[#e7e7ea]">{line}</span>
        </span>
      </div>
    </div>
  )
}
