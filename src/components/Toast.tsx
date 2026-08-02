import type { Achievement } from '../achievements.ts'
import { Icon } from '../ui/icons.tsx'

/** Плашка «получена ачивка». Живёт три секунды и ничего не перекрывает. */
export function Toast({ achievement, accent }: { achievement: Achievement; accent: string }) {
  return (
    <div
      className="fixed top-[74px] left-1/2 z-60 -translate-x-1/2"
      style={{ animation: 'toastIn .4s cubic-bezier(.2,1.3,.4,1) both' }}
      role="status"
    >
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-2.5"
        style={{
          border: `1px solid ${accent}66`,
          background: `linear-gradient(180deg, ${accent}1f, #141420)`,
          boxShadow: '0 18px 40px rgba(0,0,0,.55)',
        }}
      >
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[#12101a]"
          style={{ background: accent }}
        >
          <Icon name={achievement.icon} size={17} />
        </span>
        <span className="flex flex-col">
          <span
            className="font-mono text-[10px] tracking-[.16em] uppercase"
            style={{ color: accent }}
          >
            ачивка
          </span>
          <span className="text-sm font-semibold text-[#f2f2f5]">{achievement.title}</span>
        </span>
      </div>
    </div>
  )
}
