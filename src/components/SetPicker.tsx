import type { LevelId } from '../levels.ts'
import { LEVELS } from '../levels.ts'
import { STACK_LABEL, STACKS } from '../stacks.ts'
import { plural } from '../stats.ts'
import type { Stack } from '../types'
import { Icon, type IconName } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'

interface Props {
  level: LevelId
  stacks: Stack[]
  /** Сколько задач по языку доступно на этом уровне. null — их нет вовсе. */
  counts: Map<Stack, number | null>
  /** Длина ближайшей подборки: на узком выборе она бывает короче трёх. */
  setSize: number
  accent: string
  onLevel: (level: LevelId) => void
  onToggle: (stack: Stack) => void
  onStart: () => void
  /** В шторке панель занимает всю ширину; в колонке — липнет к шапке. */
  sheet?: boolean
  /** Без своей рамки и кнопки: панель вложена в экран настройки. */
  bare?: boolean
}

/** Иконка ранга и уровня одна и та же: это одна и та же лестница. */
const LEVEL_ICON: Record<LevelId, IconName> = {
  trainee: 'graduation-cap',
  junior: 'sprout',
  middle: 'hammer',
  senior: 'medal',
}

/**
 * Боковая панель: кто ты на ревью и на каких языках.
 *
 * Уровень — потолок сложности, а не оценка игрока: человек сам говорит,
 * на что подписывается. Языки показываются все, включая те, по которым задач
 * ещё нет: прочерк честнее, чем отсутствие строки — видно, куда растёт пак.
 */
export function SetPicker({
  level,
  stacks,
  counts,
  setSize,
  accent,
  onLevel,
  onToggle,
  onStart,
  sheet = false,
  bare = false,
}: Props) {
  // На узком экране колонка уезжает в шторку под шестерёнкой: на телефоне
  // она вдвое длиннее самой игры и отжимает кнопку «начать» за экран.
  const shell = bare
    ? 'flex w-full flex-col gap-4'
    : sheet
      ? 'flex w-full flex-col gap-4 rounded-2xl border border-[#26262c] bg-[#101014] p-[18px]'
      : 'sticky top-16 hidden min-w-[240px] flex-[0_1_288px] flex-col gap-4 rounded-2xl border border-[#26262c] bg-[#101014] p-[18px] lg:flex'

  return (
    <aside className={shell}>
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-mono text-[11px] tracking-[.18em] uppercase text-[#5c5c66]">
          кто ты на ревью
        </span>
        <span className="font-mono text-[10px] text-[#4a4a54]">сложность</span>
      </div>

      <div className="flex flex-col gap-2">
        {LEVELS.map((l) => {
          const on = l.id === level

          return (
            <button
              key={l.id}
              onClick={() => onLevel(l.id)}
              aria-pressed={on}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-left font-mono text-xs font-bold tracking-[.08em] uppercase transition-colors"
              style={{
                border: on ? `1.5px solid ${accent}88` : '1.5px solid #232329',
                background: on ? `${accent}18` : '#131318',
                color: on ? '#f2f2f5' : '#8b8b95',
              }}
            >
              <span style={{ color: on ? accent : '#71717a' }}>
                <Icon name={LEVEL_ICON[l.id]} size={17} />
              </span>
              {l.label}
              <span
                className="ml-auto text-[10px] tracking-[.08em]"
                style={{ color: on ? accent : '#4a4a54' }}
              >
                до {l.max}
              </span>
            </button>
          )
        })}
      </div>

      <div className="h-px bg-[#1f1f26]" />

      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-mono text-[11px] tracking-[.18em] uppercase text-[#5c5c66]">
          языки
        </span>
        <span className="font-mono text-[10px] text-[#4a4a54]">
          {setSize} {plural(setSize, 'задача', 'задачи', 'задач')} в подборке
        </span>
      </div>

      <div className="flex max-h-[330px] flex-col gap-0.5 overflow-x-hidden overflow-y-auto pr-1">
        {STACKS.map((stack) => {
          const count = counts.get(stack) ?? null
          const empty = count === null
          const on = stacks.includes(stack)

          return (
            <button
              key={stack}
              onClick={() => onToggle(stack)}
              disabled={empty}
              aria-pressed={on}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-[13px] transition-colors enabled:cursor-pointer enabled:hover:bg-white/4"
              style={{
                background: on ? `${accent}12` : 'transparent',
                color: empty ? '#4a4a54' : on ? '#e7e7ea' : '#9a9aa4',
              }}
            >
              <span
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md transition-colors"
                style={{
                  border: on ? `1.5px solid ${accent}` : '1.5px solid #2f2f38',
                  background: on ? accent : '#111116',
                }}
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: on ? '#0b0b0f' : 'transparent' }}
                />
              </span>
              {STACK_LABEL[stack]}
              <span
                className="ml-auto font-mono text-[11px]"
                style={{ color: empty ? '#33333c' : on ? accent : '#5c5c66' }}
              >
                {empty ? '—' : count}
              </span>
            </button>
          )
        })}
      </div>

      {!bare && (
        <Button
          variant="secondary"
          accent={accent}
          onClick={onStart}
          disabled={stacks.length === 0}
        >
          {stacks.length === 0 ? 'Выбери язык' : 'Собрать подборку'}
        </Button>
      )}
    </aside>
  )
}
