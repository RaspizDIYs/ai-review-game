/**
 * Виртуальный тик прода — то, что происходит после `/grab-evidence`.
 *
 * Экран ровно один, и это принципиально: раньше слежка растекалась на алерт,
 * сверку и брифинг, PR по дороге терялся, и было непонятно, чем всё кончилось.
 * Теперь всё, что случилось за этот ход, читается в одном месте — и оттуда
 * одна кнопка обратно к тому же самому PR.
 *
 * Правды про PR здесь нет. Есть оперативный отчёт: лог либо сел на аномалию,
 * либо не сел. Решение по пул-реквесту всё равно принимать игроку.
 */

import type { TerminalLine } from '../terminal.ts'
import { Icon } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'

interface Props {
  /** Номер PR, который лежал на логировании. */
  pr: number
  /** Оперативный отчёт — те же строки, что уедут в терминал. */
  lines: TerminalLine[]
  /** Собрал ли лог аномалию. */
  hit: boolean
  /** Сколько здоровья ушло за этот ход. */
  delta: number
  /** Что рвануло на этом же тике: слежка не отменяет старых мин. */
  incidents: number
  accent: string
  onBack: () => void
}

const COLOR: Record<TerminalLine['tone'], string> = {
  in: '#c8b4ff',
  out: '#d8d8dd',
  muted: '#7a7a86',
  good: '#6ee7b7',
  bad: '#fca5a5',
  code: '#9ecbff',
  dossier: '#8b8b95',
  art: '#3f7d63',
}

export function Tick({ pr, lines, hit, delta, incidents, accent, onBack }: Props) {
  return (
    <div className="screen-in mx-auto flex max-w-[760px] flex-col gap-4 px-[18px] pt-6">
      <div className="overflow-hidden rounded-2xl border border-[#26262c] bg-[#0b0f0c]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1b2620] bg-[#0e1512] px-5 py-3.5">
          <span style={{ color: accent }}>
            <Icon name="terminal" size={18} />
          </span>
          <h1 className="font-display m-0 text-[clamp(18px,3.2vw,23px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
            Виртуальный тик прода
          </h1>
          <span className="flex-1" />
          <span className="font-mono text-[11px] tabular-nums text-[#8b8b95]">
            {delta === 0 ? 'здоровье не изменилось' : `${delta} здоровья за ход`}
          </span>
        </div>

        <div className="flex flex-col gap-0.5 px-5 py-4 font-mono text-xs leading-[1.8]">
          {lines.map((line, i) => (
            <div key={i} style={{ color: COLOR[line.tone], whiteSpace: 'pre-wrap' }}>
              {line.text === '' ? ' ' : line.text}
            </div>
          ))}
        </div>
      </div>

      <p className="m-0 text-sm leading-[1.55] text-[#9a9aa4]">
        {hit
          ? 'Лог сел на аномалию. Прод не пострадал: код был под наблюдением, а не в бою. Где именно она — лог не знает: он видит поведение, а не причину.'
          : 'Логи ничего не поймали. Прод почти не пострадал — код был под наблюдением, — но и улики нет. Смотри сам.'}
        {incidents > 0 &&
          ' Пока ты следил, в проде рвануло старое: ход прошёл и для тех мин, что лежали раньше.'}
      </p>

      <Button accent={accent} onClick={onBack} iconAfter="arrow-right" autoFocus>
        Вернуться к #{pr}
      </Button>
    </div>
  )
}
