/**
 * Подсказка первого раунда. Показывается ровно один раз за всю жизнь:
 * игра про внимательность, и постоянная плашка в ней — шум.
 */
export function Hint({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-4 text-sm">
      <ul className="space-y-2 text-zinc-300">
        <li>
          <b className="text-zinc-100">Кликни строку</b>, в которой код выглядит рабочим,
          но им не является. Есть две попытки.
        </li>
        <li>
          Подлянки может <b className="text-zinc-100">не быть вовсе</b> — тогда жми
          «Здесь чисто». Обвинить нормальный код так же плохо, как пропустить плохой.
        </li>
        <li>
          Иногда кода <b className="text-zinc-100">не хватает</b>: отмечай строку,
          рядом с которой он должен был быть.
        </li>
      </ul>

      <button
        onClick={onClose}
        className="mt-4 text-xs uppercase tracking-widest text-sky-400 transition hover:text-sky-300"
      >
        Понятно, скрыть
      </button>
    </div>
  )
}
