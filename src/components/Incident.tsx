/**
 * Экран инцидента в слепой смене.
 *
 * Раньше он сам называл виновного: «#1408, ты смёржил это на первом ходу».
 * Теперь не называет — обратного адреса нет. Есть лог с симптомом и список
 * всех своих мёрджей, и разбираться игрок должен сам.
 *
 * Угадывание тут не случайное. Лог говорит про область (кэш отдаёт устаревшее,
 * деньги не сходятся, очередь стоит), заголовок PR — тоже, он собран из файла,
 * который правили. Плюс время: рвануло через несколько ходов после мёрджа.
 *
 * Правильность ответа не сообщается ни здесь, ни потом. Понять, попал ли,
 * можно только по проду: замедлилась утечка — попал.
 */

import type { Defect } from '../defects.ts'
import type { IncidentLog } from '../incident.ts'
import { Icon } from '../ui/icons.tsx'
import { Button } from '../ui/kit.tsx'

interface Props {
  defect: Defect
  log: IncidentLog | null
  /** Сколько здоровья ушло за прошлый ход. */
  delta: number
  /** Который раз подряд падает по этой причине. */
  again: boolean
  accent: string
  onRepair: () => void
  onNext: () => void
}

const RED = '#f87171'

/** Общий лог: когда на тег нет своего, показываем хотя бы симптом. */
function fallback(defect: Defect): IncidentLog {
  return {
    tag: defect.tag,
    lines: `03:12  api-7f4c  ERROR  необработанный сбой, растёт число пятисотых\n03:12  api-7f4c  ERROR  ${defect.tag}\n03:14  on-call        поднят по алерту`,
  }
}

export function Incident({ defect, log, delta, again, accent, onRepair, onNext }: Props) {
  const shown = log ?? fallback(defect)

  return (
    <div className="screen-in mx-auto flex max-w-[900px] flex-col gap-4 px-[18px] pt-6">
      <div
        className="overflow-hidden rounded-2xl"
        style={{ border: `1px solid ${RED}55`, background: `linear-gradient(180deg,${RED}12,#0e0e12 60%)` }}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1f1f26] px-5 py-3.5">
          <span style={{ color: RED, animation: 'pulseRed 1.2s ease-in-out infinite' }}>
            <Icon name="siren" size={20} />
          </span>
          <h1 className="font-display m-0 text-[clamp(19px,3.4vw,25px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
            Инцидент в проде
          </h1>
          <span className="flex-1" />
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[11px] tabular-nums"
            style={{ border: `1px solid ${RED}55`, color: RED }}
          >
            {delta} здоровья за ход
          </span>
        </div>

        <pre className="m-0 overflow-x-auto px-5 py-4 font-mono text-xs leading-[1.85] text-[#c9c9d1]">
          {shown.lines}
        </pre>

        {shown.metric && (
          <p className="m-0 border-t border-[#1f1f26] px-5 py-2.5 font-mono text-[11px] text-[#8b8b95]">
            {shown.metric}
          </p>
        )}
      </div>

      <p className="m-0 text-sm leading-[1.55] text-[#9a9aa4]">
        {again
          ? 'Прод падает по той же причине. Он будет падать каждый ход, пока её не починят — сама она не рассосётся.'
          : 'Что-то из смёрженного уронило прод. Пока причину не найдёшь, он будет падать снова каждый ход.'}
      </p>

      {/* Авария — единственное место в смене, где чинить можно прямо сейчас.
          Времени и попыток там не считают: прод лежит, остальное подождёт. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Button accent={RED} onClick={onRepair} autoFocus>
          Чинить · время не идёт
        </Button>
        <Button variant="secondary" accent={accent} onClick={onNext}>
          Оставить и работать дальше
        </Button>
      </div>

      <p className="m-0 font-mono text-[11px] text-[#5c5c66]">
        оставить — значит согласиться, что прод падает каждый ход
      </p>
    </div>
  )
}
