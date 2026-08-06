import { Icon } from '../ui/icons.tsx'
import { Button, Kicker } from '../ui/kit.tsx'

/**
 * Правила. Показываются один раз в жизни — перед самой первой игрой,
 * а не поверх дифа: в раунде уже идёт таймер, и читать инструкцию тогда поздно.
 */
export function Rules({ accent, onStart }: { accent: string; onStart: () => void }) {
  const items = [
    {
      icon: 'target' as const,
      text: (
        <>
          <b className="text-[#e7e7ea]">Отметь строки</b>, в которых код выглядит рабочим,
          но им не является. Подлянка бывает не одна, попыток — две.
        </>
      ),
    },
    {
      icon: 'shield-check' as const,
      text: (
        <>
          Подлянки может <b className="text-[#e7e7ea]">не быть вовсе</b> — тогда отправляй
          пустой ответ, это апрув. Обвинить нормальный код так же плохо, как пропустить плохой.
        </>
      ),
    },
    {
      icon: 'circle-alert' as const,
      text: (
        <>
          Иногда кода <b className="text-[#e7e7ea]">не хватает</b>: отмечай строку, рядом
          с которой он должен был быть.
        </>
      ),
    },
    {
      icon: 'bug' as const,
      text: (
        <>
          Нашёл строку — спросим, <b className="text-[#e7e7ea]">что с ней не так</b>.
          Не угадаешь причину — раунд засчитан вполовину.
        </>
      ),
    },
    // Терминал есть только в смене, и правила обязаны это сказать прямо:
    // иначе игрок будет искать кнопку в дневном челлендже.
    {
      icon: 'terminal' as const,
      text: (
        <>
          На смене под дифом есть <b className="text-[#e7e7ea]">терминал</b>. Он не скажет,
          где подлянка, но покажет, кто из агентов писал строку и чем этот агент известен.
          Команда <span className="font-mono text-[13px] text-[#c8b4ff]">help</span> — список
          остальных. Подсказки стоят времени раунда.
        </>
      ),
    },
  ]

  return (
    <div className="screen-in mx-auto flex max-w-[640px] flex-col gap-4 px-[18px] pt-8">
      <div>
        <Kicker>как это работает</Kicker>
        <h1 className="font-display mt-2 text-[clamp(26px,5vw,36px)] font-bold tracking-[-.02em] text-[#f4f4f6]">
          Ты — ревьюер
        </h1>
        <p className="mt-2.5 leading-[1.55] text-[#9a9aa4]">
          ИИ прислала пул-реквест и уверена, что всё в порядке. Тесты зелёные, сборка прошла.
          У тебя 90 секунд на раунд.
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-[14px] border border-[#26262c] bg-[#111116] px-4 py-3.5 text-[15px] leading-[1.5] text-[#a9a9b4]"
          >
            <span className="mt-0.5" style={{ color: accent }}>
              <Icon name={item.icon} size={17} />
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      <Button accent={accent} onClick={onStart} iconAfter="arrow-right" autoFocus>
        Понятно, начинаем
      </Button>

      <p className="text-center font-mono text-[11px] text-[#5c5c66]">
        Больше это окно не появится
      </p>
    </div>
  )
}
