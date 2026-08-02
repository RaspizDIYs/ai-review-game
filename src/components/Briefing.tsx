import type { Task } from '../types'

const STACK_LABEL: Record<Task['stack'], string> = {
  js: 'JavaScript / TypeScript',
  py: 'Python',
  sql: 'SQL',
}

export function Briefing({ task, onStart }: { task: Task; onStart: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          {STACK_LABEL[task.stack]} · сложность {task.difficulty}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-100 sm:text-2xl">{task.title}</h1>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Попросили у ИИ</p>
        <p className="text-zinc-300 italic">«{task.prompt}»</p>
      </div>

      <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-emerald-500/80">
          Прогон прошёл
        </p>
        <pre className="overflow-x-auto overscroll-x-contain font-mono text-[11px] leading-5 text-emerald-200/90 sm:text-[13px] sm:leading-6">
          {task.tests}
        </pre>
      </div>

      <p className="text-zinc-400">
        Тесты зелёные, сборка прошла. Найди, где тебя обманули — за 90 секунд.
      </p>

      <button
        onClick={onStart}
        className="w-full rounded-lg bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
      >
        К ревью
      </button>
    </div>
  )
}
