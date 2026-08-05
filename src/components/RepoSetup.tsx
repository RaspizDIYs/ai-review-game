/**
 * Первый вход: как называется твой репозиторий.
 *
 * Это не настройка, а начало игры. Дальше это имя стоит в шапке каждого PR,
 * в приглашении терминала и в логах инцидентов — игра про твой проект, а не
 * про наш демонстрационный. Поэтому спрашивают один раз и до главного меню,
 * а не прячут в шестерёнку.
 *
 * Пропустить можно: тогда останется имя по умолчанию. Переименовать — в любой
 * момент прямо в шапке.
 */

import { useState } from 'react'
import { DEFAULT_REPO, normalizeRepo } from '../pr.ts'
import { Icon } from '../ui/icons.tsx'
import { Button, Kicker } from '../ui/kit.tsx'

interface Props {
  accent: string
  /** Готовое имя либо пусто — тогда игра оставит значение по умолчанию. */
  onDone: (repo: string) => void
}

export function RepoSetup({ accent, onDone }: Props) {
  const [draft, setDraft] = useState('')
  const preview = normalizeRepo(draft)

  return (
    <div className="fixed inset-0 z-70 flex items-start justify-center overflow-y-auto bg-[#06060899] px-4 py-[max(16px,8vh)] backdrop-blur-[3px]">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onDone(draft.trim() ? preview : '')
        }}
        className="flex w-full max-w-[460px] flex-col gap-4 rounded-2xl border border-[#26262c] bg-[#111116] p-6"
        style={{
          animation: 'toastIn .35s cubic-bezier(.2,1.2,.4,1) both',
          boxShadow: '0 30px 70px rgba(0,0,0,.6)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: accent }}>
            <Icon name="git-pull-request" size={18} />
          </span>
          <h2 className="font-display m-0 text-[21px] font-bold tracking-[-.02em] text-[#f4f4f6]">
            Твой репозиторий
          </h2>
        </div>

        <p className="m-0 text-sm leading-[1.55] text-[#9a9aa4]">
          ИИ будет присылать пул-реквесты именно сюда. Название попадёт в шапку,
          в терминал и в ночные алерты — назови так, как назвал бы свой проект.
        </p>

        <label className="flex flex-col gap-1.5">
          <Kicker>владелец / репозиторий</Kicker>
          <input
            value={draft}
            autoFocus
            spellCheck={false}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={DEFAULT_REPO}
            aria-label="Название репозитория"
            className="w-full rounded-xl border border-[#2f2f38] bg-[#0e0e12] px-3.5 py-3 font-mono text-[13px] text-[#e7e7ea] outline-none placeholder:text-[#4a4a54]"
            style={{ borderColor: draft.trim() ? `${accent}66` : undefined }}
          />
        </label>

        <p className="m-0 font-mono text-[11px] text-[#5c5c66]">
          в шапке будет: <span style={{ color: accent }}>{preview}</span>
        </p>

        <Button accent={accent} icon="check-check">
          {draft.trim() ? 'Так и назовём' : 'Оставить по умолчанию'}
        </Button>
      </form>
    </div>
  )
}
