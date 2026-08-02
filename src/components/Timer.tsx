import { useEffect, useRef, useState } from 'react'
import { ROUND_SECONDS } from '../scoring'

/** Отсчёт по реальным часам, а не по числу тиков — вкладка может уснуть. */
export function useCountdown(running: boolean, onExpire: () => void) {
  const [left, setLeft] = useState(ROUND_SECONDS)
  const startedAt = useRef<number | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (!running) return
    startedAt.current = performance.now()
    fired.current = false

    const id = setInterval(() => {
      const elapsed = (performance.now() - startedAt.current!) / 1000
      const rest = Math.max(0, ROUND_SECONDS - elapsed)
      setLeft(rest)
      if (rest === 0 && !fired.current) {
        fired.current = true
        onExpire()
      }
    }, 100)

    return () => clearInterval(id)
  }, [running, onExpire])

  return { left, reset: () => setLeft(ROUND_SECONDS) }
}

export function Timer({ left }: { left: number }) {
  const pct = (left / ROUND_SECONDS) * 100
  const tense = left <= 20

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-zinc-500">Осталось</span>
        <span
          className={[
            'font-mono text-lg tabular-nums',
            tense ? 'text-red-400' : 'text-zinc-300',
          ].join(' ')}
        >
          {Math.ceil(left)} с
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={['h-full transition-[width]', tense ? 'bg-red-500' : 'bg-zinc-400'].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
