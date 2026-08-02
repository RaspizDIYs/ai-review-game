import type { Task } from '../types'
import { DiffView, type LineState } from './DiffView'

export type Outcome = 'found' | 'missed' | 'clean-correct' | 'false-accusation'

const HEAD: Record<Outcome, { title: string; tone: string; sub: string }> = {
  found: {
    title: 'Нашёл',
    tone: 'text-emerald-400',
    sub: 'В прод не уехало.',
  },
  missed: {
    title: 'Уехало в прод',
    tone: 'text-red-400',
    sub: 'Ночью инцидент. Следующий раунд играешь уставшим — времени меньше.',
  },
  'clean-correct': {
    title: 'Здесь и правда было чисто',
    tone: 'text-emerald-400',
    sub: 'Пропустить нормальный код — тоже навык.',
  },
  'false-accusation': {
    title: 'Обвинил невиновного',
    tone: 'text-amber-400',
    sub: 'Подлянки не было. Заблокированный на ровном месте мёрдж стоит денег не меньше пропущенного бага.',
  },
}

interface Props {
  task: Task
  outcome: Outcome
  score: number
  picked: number | null
  onNext: () => void
  hasNext: boolean
}

export function Verdict({ task, outcome, score, picked, onNext, hasNext }: Props) {
  const head = HEAD[outcome]

  const marks = new Map<number, LineState>()
  for (const d of task.decoys) marks.set(d.line, 'decoy')
  if (picked !== null && !task.bugs.some((b) => b.line === picked)) marks.set(picked, 'wrong')
  for (const b of task.bugs) marks.set(b.line, 'correct')

  const pickedDecoy = picked !== null ? task.decoys.find((d) => d.line === picked) : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className={`text-2xl font-semibold ${head.tone}`}>{head.title}</h2>
          <p className="mt-1 text-sm text-zinc-400">{head.sub}</p>
        </div>
        <span className="font-mono text-2xl tabular-nums text-zinc-200">+{score}</span>
      </div>

      <DiffView diff={task.diff} marks={marks} disabled />

      {task.bugs.map((bug) => (
        <div key={bug.line} className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-emerald-500/80">
            Строка {bug.line} · {bug.tag}
            {bug.kind === 'missing' && ' · здесь не хватает кода'}
          </p>
          <p className="text-zinc-200">{bug.explain}</p>
          <p className="mt-3 text-zinc-400">{bug.consequence}</p>
        </div>
      ))}

      {pickedDecoy && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-amber-500/80">
            Ты выбрал строку {pickedDecoy.line}
          </p>
          <p className="text-zinc-300">{pickedDecoy.why}</p>
        </div>
      )}

      {task.clean && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
            Что здесь смущало
          </p>
          <ul className="space-y-2 text-zinc-400">
            {task.decoys.map((d) => (
              <li key={d.line}>
                <span className="font-mono text-zinc-500">{d.line}:</span> {d.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
      >
        {hasNext ? 'Дальше' : 'Итог'}
      </button>
    </div>
  )
}
