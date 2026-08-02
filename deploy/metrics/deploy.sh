#!/usr/bin/env bash
# Выкладка приёмника метрик.
#
#   HOST=myserver ./deploy/metrics/deploy.sh
set -euo pipefail

HOST="${HOST:?укажи хост: HOST=myserver ./deploy/metrics/deploy.sh}"
DIR="${DIR:-/root/review-metrics}"

cd "$(dirname "$0")"

ssh "$HOST" "mkdir -p $DIR/log"
rsync -az docker-compose.yml "$HOST:$DIR/"
rsync -az --delete conf/ "$HOST:$DIR/conf/"

# nginx.conf примонтирован каталогом, но конфиг всё равно надо перечитать:
# compose up -d не пересоздаёт контейнер, если определение сервиса не изменилось.
ssh "$HOST" "cd $DIR && docker compose up -d && docker compose exec -T metrics nginx -s reload 2>/dev/null || true; docker compose ps"
