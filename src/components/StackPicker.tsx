/**
 * Выбор своего стека — только для смены.
 *
 * Здесь спрашивают не «какие языки тебе нравятся», а «на чём ты работаешь»:
 * чем рисуете фронт, чем пишете сервер, чем катите. Потолка сложности нет
 * и не будет — свой стек человек обязан знать целиком, и подлянка на пятёрке
 * прилетает в нём с первого же хода, как в проде.
 *
 * База в стек входит всегда: SQL не выбирается, потому что нет команд,
 * у которых его нет.
 */

import { STACK_LABEL, STACK_ROLE, type ShiftStack, type StackRole } from '../stacks.ts'
import type { Stack } from '../types'
import { Icon } from '../ui/icons.tsx'
import { Kicker } from '../ui/kit.tsx'

interface Props {
  value: ShiftStack
  /** Сколько задач в паке по каждому языку — чтобы выбор был осмысленным. */
  counts: Map<Stack, number>
  accent: string
  onChange: (next: ShiftStack) => void
}

const ROLES: StackRole[] = ['front', 'back', 'pipeline']

export function StackPicker({ value, counts, accent, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {ROLES.map((role) => {
        const { label, hint, of } = STACK_ROLE[role]

        return (
          <div key={role} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <Kicker>{label}</Kicker>
              <span className="font-mono text-[10px] text-[#4a4a54]">{hint}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {of.map((stack) => {
                const on = value[role] === stack
                const has = counts.get(stack) ?? 0

                return (
                  <button
                    key={stack}
                    onClick={() => onChange({ ...value, [role]: stack })}
                    disabled={has === 0}
                    aria-pressed={on}
                    className="flex cursor-pointer items-center gap-2 rounded-[11px] px-3 py-2 text-[13px] transition-colors disabled:cursor-default"
                    style={{
                      border: on ? `1.5px solid ${accent}88` : '1.5px solid #232329',
                      background: on ? `${accent}18` : '#131318',
                      color: has === 0 ? '#3f3f48' : on ? '#f2f2f5' : '#9a9aa4',
                    }}
                  >
                    {STACK_LABEL[stack]}
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: on ? accent : '#4a4a54' }}
                    >
                      {has || '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.5] text-[#6b6b77]">
        <span className="mt-0.5 text-[#4a4a54]">
          <Icon name="circle-alert" size={14} />
        </span>
        База входит в стек всегда. Потолка сложности в смене нет: свой стек надо
        знать целиком, даже если ты джун.
      </p>
    </div>
  )
}
