import { useEffect, useRef, useState } from 'react'

/**
 * Отсчёт по реальным часам, а не по числу тиков — вкладка может уснуть.
 * duration меняется от раунда к раунду: усталость после пропущенной подлянки.
 */
export function useCountdown(running: boolean, duration: number, onExpire: () => void) {
  const [left, setLeft] = useState(duration)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    setLeft(duration)
    if (!running) return

    const startedAt = performance.now()
    let fired = false

    const id = setInterval(() => {
      const rest = Math.max(0, duration - (performance.now() - startedAt) / 1000)
      setLeft(rest)
      if (rest === 0 && !fired) {
        fired = true
        expire.current()
      }
    }, 100)

    return () => clearInterval(id)
  }, [running, duration])

  return left
}

export function Timer({ left, duration }: { left: number; duration: number }) {
  const tense = left <= 20
  const tired = duration < 90

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          Осталось{tired && <span className="ml-2 text-red-500/80">после инцидента</span>}
        </span>
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
          style={{ width: `${(left / duration) * 100}%` }}
        />
      </div>
    </div>
  )
}
