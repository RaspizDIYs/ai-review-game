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
