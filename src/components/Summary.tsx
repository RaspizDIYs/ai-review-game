import { useState } from 'react'
import type { Task } from '../types'
import type { Outcome } from '../types'
import { buildShare, copy, formatTime, isWin } from '../share.ts'

export interface Played {
  task: Task
  outcome: Outcome
  score: number
}

interface Props {
  mode: 'daily' | 'endless'
  day: string
  history: Played[]
  seconds: number
  newRecord: boolean
  onHome: () => void
}

const LABEL: Record<Outcome, string> = {
  found: 'нашёл',
  'clean-correct': 'было чисто',
  missed: 'уехало в прод',
  'false-accusation': 'обвинил зря',
}

export function Summary({ mode, day, history, seconds, newRecord, onHome }: Props) {
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)

  const total = history.reduce((s, r) => s + r.score, 0)
  const wins = history.filter((r) => isWin(r.outcome)).length
  const share = buildShare(day, history.map((r) => r.outcome), seconds)

  async function onShare() {
    if (await copy(share)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setFallback(share)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">
          {mode === 'daily' ? 'Смена окончена' : 'Три инцидента — тебя отстранили'}
        </h2>
        <p className="mt-1 text-zinc-400">
          {wins} из {history.length} · {total} очков · {formatTime(seconds)}
        </p>
        {newRecord && <p className="mt-1 text-emerald-400">Личный рекорд</p>}
      </div>

      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {history.map((r, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-300">{r.task.title}</span>
            <span className="flex items-center gap-3 text-sm text-zinc-500">
              <span>{LABEL[r.outcome]}</span>
              <span className="font-mono tabular-nums">{r.score}</span>
            </span>
          </li>
        ))}
      </ul>

      {mode === 'daily' && (
        <>
          <pre className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-center font-mono text-sm leading-7 text-zinc-300">
            {share}
          </pre>

          <button
            onClick={onShare}
            className="w-full rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
          >
            {copied ? 'Скопировано' : 'Скопировать результат'}
          </button>

          {fallback && (
            <p className="text-center text-sm text-amber-400">
              Буфер обмена недоступен — скопируй текст выше руками.
            </p>
          )}
        </>
      )}

      <button
        onClick={onHome}
        className="w-full rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
      >
        На главную
      </button>
    </div>
  )
}
