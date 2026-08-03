/**
 * Имя репозитория в шапке — оно же поле ввода.
 *
 * Отдельной настройки под это нет нарочно: игрок правит название там же,
 * где его и видит, как переименовывают файл в проводнике. Пока не тронул —
 * это просто строка шапки и места не занимает.
 */

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_REPO, normalizeRepo } from '../pr.ts'
import { Icon } from '../ui/icons.tsx'

interface Props {
  /** Сырое значение из профиля: пусто — покажем имя по умолчанию. */
  value: string
  accent: string
  onChange: (repo: string) => void
}

const TEXT = 'font-mono text-xs tracking-[.02em]'

export function RepoName({ value, accent, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    input.current?.select()
  }, [editing])

  function open() {
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    // Пустое поле — это отказ от своего имени, а не пустая шапка.
    onChange(draft.trim() ? normalizeRepo(draft) : '')
  }

  if (!editing) {
    return (
      <button
        onClick={open}
        title="Переименовать репозиторий"
        className={`group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-white/6 ${TEXT} text-[#e7e7ea]`}
      >
        <span className="truncate">{normalizeRepo(value)}</span>
        <span className="shrink-0 text-[#3a3a44] transition-colors group-hover:text-[#8b8b95]">
          <Icon name="pencil" size={11} />
        </span>
      </button>
    )
  }

  return (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      placeholder={DEFAULT_REPO}
      maxLength={60}
      spellCheck={false}
      aria-label="Название репозитория"
      // Поле по длине текста: фиксированная ширина либо режет имя,
      // либо забирает у заголовка PR половину шапки.
      style={{ width: `${Math.min(30, Math.max(14, draft.length + 2))}ch`, outlineColor: accent }}
      className={`min-w-0 rounded-md border border-[#2f2f38] bg-[#0e0e12] px-1.5 py-0.5 ${TEXT} text-[#e7e7ea] outline-1 placeholder:text-[#4a4a54]`}
    />
  )
}
