# Приёмник метрик

Отдельный nginx: отдаёт 204 на `/e` и пишет строку в `log/events.log`.
Больше он ничего не делает — вся «аналитика» живёт в `scripts/metrics.mjs`.

```bash
HOST=myserver ./deploy/metrics/deploy.sh
HOST=myserver node ../../scripts/metrics.mjs
```

Домен задаётся на сервере, в `<каталог>/.env` → `METRICS_DOMAIN=...`.

## Грабли

**Traefik не повторяет выпуск сертификата сам.** Если роутер подняли раньше,
чем появилась A-запись, ACME падает с NXDOMAIN и Traefik больше не пробует —
домен так и остаётся на самоподписанном `TRAEFIK DEFAULT CERT`. Простой
`restart` не помогает: конфиг не изменился. Нужен `docker compose up -d
--force-recreate`, тогда Traefik видит новый контейнер и пробует заново.

**Лог не ротируется сам.** На сервере лежит `/etc/logrotate.d/review-metrics`
с `copytruncate` — обычная ротация не сработает, потому что файл держит nginx
внутри контейнера, и послать ему сигнал снаружи нельзя.
