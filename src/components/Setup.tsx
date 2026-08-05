/**
 * Настройка перед игрой.
 *
 * Раньше уровень и языки висели колонкой на главной постоянно и при этом
 * влияли ровно на один режим. Теперь настройка появляется под тот режим,
 * который игрок выбрал, и спрашивает только то, что этому режиму нужно:
 *
 * - **челлендж** — не спрашивает ничего. На то он и челлендж: повезёт
 *   с языком или нет, а может, догадаешься и на чужом;
 * - **бесконечный и подборка** — уровень и языки;
 * - **смена** — свой стек, без потолка сложности.
 */

import type { LevelId } from '../levels.ts'
import type { ShiftStack } from '../stacks.ts'
import type { Stack } from '../types'
import { Button } from '../ui/kit.tsx'
import { SetPicker } from './SetPicker.tsx'
import { StackPicker } from './StackPicker.tsx'

interface Props {
  mode: 'endless' | 'set' | 'shift'
  accent: string
  /** Уровень и языки — для бесконечного и подборки. */
  level: LevelId
  stacks: Stack[]
  counts: Map<Stack, number | null>
  setSize: number
  onLevel: (level: LevelId) => void
  onToggle: (stack: Stack) => void
  /** Свой стек — для смены. */
  shiftStack: ShiftStack
  packCounts: Map<Stack, number>
  onShiftStack: (next: ShiftStack) => void
  onStart: () => void
  onBack: () => void
}

const HEAD: Record<Props['mode'], { title: string; hint: string; start: string }> = {
  endless: {
    title: 'Ночное дежурство',
    hint: 'Играешь, пока полоска здоровья не кончится. Уровень режет сложность, языки — то, что вообще может выпасть.',
    start: 'Заступить',
  },
  set: {
    title: 'Своя подборка',
    hint: 'Три задачи под уровень и выбранные языки. Каждая следующая подборка другая.',
    start: 'Собрать',
  },
  shift: {
    title: 'Твой стек',
    hint: 'Смена играется только по твоему стеку. Ошибка в нём бывает любой сложности — потолка здесь нет.',
    start: 'Заступить на смену',
  },
}

export function Setup({
  mode,
  accent,
  level,
  stacks,
  counts,
  setSize,
  onLevel,
  onToggle,
  shiftStack,
  packCounts,
  onShiftStack,
  onStart,
  onBack,
}: Props) {
  const head = HEAD[mode]
  const ready = mode === 'shift' || stacks.length > 0

  return (
    <div className="screen-in mx-auto flex max-w-[640px] flex-col gap-4 px-[18px] pt-6">
      <div>
        <h1 className="font-display m-0 text-[clamp(22px,4vw,30px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
          {head.title}
        </h1>
        <p className="mt-2.5 max-w-[520px] text-sm leading-[1.55] text-[#9a9aa4]">{head.hint}</p>
      </div>

      <div className="rounded-2xl border border-[#26262c] bg-[#101014] p-[18px]">
        {mode === 'shift' ? (
          <StackPicker
            value={shiftStack}
            counts={packCounts}
            accent={accent}
            onChange={onShiftStack}
          />
        ) : (
          <SetPicker
            sheet
            bare
            level={level}
            stacks={stacks}
            counts={counts}
            setSize={setSize}
            accent={accent}
            onLevel={onLevel}
            onToggle={onToggle}
            onStart={onStart}
          />
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Button accent={accent} disabled={!ready} onClick={onStart} autoFocus>
          {ready ? head.start : 'Выбери язык'}
        </Button>
        <Button variant="secondary" accent={accent} onClick={onBack}>
          Назад
        </Button>
      </div>
    </div>
  )
}
