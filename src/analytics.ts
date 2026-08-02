/**
 * Счётчик заходов. Бэкенда у нас нет, поэтому либо внешний сервис, либо ничего.
 *
 * Адрес задаётся при сборке через VITE_ANALYTICS_URL. Не задан — функция
 * не делает ничего и наружу не ходит: считать игроков не настолько важно,
 * чтобы по умолчанию тащить чужой скрипт на страницу.
 */
const URL_ = import.meta.env.VITE_ANALYTICS_URL

export function countVisit(): void {
  if (!URL_) return

  // Пиксель, а не скрипт: третьей стороне не даём ничего, кроме факта захода.
  new Image().src = `${URL_}?p=${encodeURIComponent(location.pathname)}`
}
