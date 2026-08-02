import type { Agent } from '../agents.ts'
import type { Task } from '../types'
import { Icon } from '../ui/icons.tsx'
import { AgentAvatar, Button, Kicker } from '../ui/kit.tsx'

interface Props {
  task: Task
  agent: Agent
  /** Реплика агента: он уверен, что всё в порядке. В этом и подвох. */
  line: string
  seconds: number
  onStart: () => void
}

export function Briefing({ task, agent, line, seconds, onStart }: Props) {
  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div className="overflow-hidden rounded-2xl border border-[#26262c] bg-[#111116]">
        <div className="flex flex-wrap items-stretch gap-5 border-b border-[#1f1f26] p-5">
          <AgentAvatar
            slug={agent.slug}
            name={agent.name}
            color={agent.color}
            size={176}
            style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 6px 0 #0b0b0e, 0 0 34px ${agent.color}26` }}
          />

          <div className="flex min-w-[220px] flex-[1_1_260px] flex-col justify-center">
            <h1 className="font-display m-0 text-[clamp(20px,3.6vw,27px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
              {task.title}
            </h1>

            <div className="mt-3 flex flex-wrap gap-[7px]">
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-[11px]"
                style={{ border: `1px solid ${agent.color}44`, color: agent.color }}
              >
                {agent.lang}
              </span>
              <span className="rounded-full border border-[#26262c] px-2.5 py-0.5 font-mono text-[11px] text-[#8b8b95]">
                сложность {task.difficulty}
              </span>
            </div>

            <Kicker className="mt-4">попросили у ии</Kicker>
            <p className="mt-[7px] text-[15px] leading-[1.55] text-[#d8d8dd] italic">
              «{task.prompt}»
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-[18px]">
          <div className="overflow-hidden rounded-xl border border-[rgba(52,211,153,.22)] bg-[rgba(16,185,129,.05)]">
            <div className="flex items-center gap-2 border-b border-[rgba(52,211,153,.14)] bg-[rgba(16,185,129,.05)] px-3.5 py-2.5">
              <span className="text-[#34d399]">
                <Icon name="check-check" size={15} />
              </span>
              <span className="text-[13px] font-semibold text-[#6ee7b7]">Все проверки прошли</span>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-[rgba(110,231,183,.6)]">ci · 0m 42s</span>
            </div>
            <pre className="m-0 overflow-x-auto px-3.5 py-3 font-mono text-xs leading-[1.75] text-[rgba(167,243,208,.85)]">
              {task.tests}
            </pre>
          </div>

          <div
            className="flex items-start gap-3 rounded-[14px] px-4 py-3.5"
            style={{
              border: `1px solid ${agent.color}3d`,
              background: `linear-gradient(180deg, ${agent.color}12, #101014 70%)`,
            }}
          >
            <span className="mt-0.5" style={{ color: agent.color }}>
              <Icon name="sparkles" size={16} />
            </span>
            <p className="m-0 text-sm leading-[1.5] text-[#a9a9b4]">{line}</p>
          </div>
        </div>
      </div>

      <Button accent={agent.color} onClick={onStart} autoFocus>
        Открыть диф · {seconds} секунд
      </Button>
    </div>
  )
}
