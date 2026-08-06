/**
 * Ответ ИИ на обвинение.
 *
 * Всплывает после отправки — и всегда одинаково подобострастно, прав игрок
 * или нет. Именно поэтому плашку можно показывать даже в слепой смене:
 * информации в ней ровно ноль, а смеха достаточно.
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
      className="fixed top-[74px] left-1/2 z-60 w-[min(440px,calc(100vw-32px))] -translate-x-1/2"
      style={{ animation: 'toastIn .4s cubic-bezier(.2,1.3,.4,1) both' }}
      role="status"
    >
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{
          border: `1px solid ${color}66`,
          background: `linear-gradient(180deg, ${color}1f, #141420)`,
          boxShadow: '0 18px 40px rgba(0,0,0,.55)',
        }}
      >
        <AgentAvatar
          slug={anonymous ? 'unknown' : agent.slug}
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
