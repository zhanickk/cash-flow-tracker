import { useCallback, useEffect, useRef } from "react";

/**
 * Замок от повторного запуска одного и того же действия.
 *
 * Зачем: 16 сентября «Новый день» сработал пять раз за 1.6 секунды — смену
 * закрыли пятикратно, остатки продублировались, их удаляли вручную и вбивали
 * заново, и доллар вбили на 10 044 меньше. Блокировки кнопки через состояние
 * React для этого мало: состояние обновляется к следующей отрисовке, а
 * нажатия Enter приходят подряд в одном тике — все они успевают проскочить до
 * того, как кнопка станет неактивной.
 *
 * Здесь замок лежит в ref и закрывается синхронно, в той же строке, где
 * начинается действие. Второе нажатие упирается в него сразу.
 *
 * Асинхронное действие держит замок до конца (успех или ошибка), синхронное —
 * cooldownMs миллисекунд. Этого хватает, чтобы отсечь случайный дубль, и не
 * мешает работе: между двумя настоящими операциями кассир успевает набрать
 * сумму и курс, а это заметно дольше.
 */
export function useActionLock(cooldownMs = 500) {
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    busy.current = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Запускает fn, если предыдущий запуск ещё не отпустил замок. */
  const run = useCallback(
    <T,>(fn: () => T): T | undefined => {
      if (busy.current) return undefined;
      busy.current = true;
      let result: T;
      try {
        result = fn();
      } catch (e) {
        release();
        throw e;
      }
      const thenable = result as unknown as { then?: unknown; finally?: (cb: () => void) => unknown };
      if (thenable && typeof thenable.then === "function" && typeof thenable.finally === "function") {
        thenable.finally(release);
      } else {
        timer.current = setTimeout(release, cooldownMs);
      }
      return result;
    },
    [cooldownMs, release],
  );

  return run;
}

/**
 * Оборачивает обработчик так, чтобы его нельзя было запустить повторно, пока
 * предыдущий запуск не закончился. Удобно, когда обработчик передают дальше
 * как onClick/onEnter и оборачивать каждое место по отдельности неудобно.
 */
export function useLockedAction<A extends unknown[], R>(
  fn: (...args: A) => R,
  cooldownMs = 500,
): (...args: A) => R | undefined {
  const run = useActionLock(cooldownMs);
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => run(() => ref.current(...args)), [run]);
}
