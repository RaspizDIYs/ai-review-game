import { useEffect, useRef, useState } from 'react'

/**
 * Отсчёт по реальным часам, а не по числу тиков — вкладка может уснуть.
 * duration меняется от раунда к раунду: усталость после пропущенной подлянки.
 *
 * `penalty` — секунды, которые списал терминал за подсказку. Отдельным
 * параметром, а не вычитанием из `duration`: смена `duration` перезапускает
 * отсчёт с нуля, и подсказка возвращала бы игроку всё потраченное время.
 */
export function useCountdown(
  running: boolean,
  duration: number,
  onExpire: () => void,
  penalty = 0,
) {
  const [left, setLeft] = useState(duration)
  const expire = useRef(onExpire)
  expire.current = onExpire
  const fine = useRef(penalty)
  fine.current = penalty

  useEffect(() => {
    setLeft(duration)
    if (!running) return

    const startedAt = performance.now()
    let fired = false

    const id = setInterval(() => {
      const rest = Math.max(0, duration - fine.current - (performance.now() - startedAt) / 1000)
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
