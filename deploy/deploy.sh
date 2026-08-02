#!/usr/bin/env bash
# Выкладка «Ревью за ИИ» на свой сервер с Traefik.
#
#   ./deploy/deploy.sh
#
# Домен берётся из .env на сервере — здесь его нет намеренно,
# чтобы сменить его можно было без правки репозитория.
set -euo pipefail

HOST="${HOST:?укажи хост: HOST=myserver ./deploy/deploy.sh}"
DIR="${DIR:-/root/review-after-ai}"

cd "$(dirname "$0")/.."

echo "→ сборка"
npm run build

echo "→ проверка, что собралось не пустое"
test -f dist/index.html
test -d dist/assets

echo "→ заливаю на $HOST:$DIR"
ssh "$HOST" "mkdir -p $DIR"
rsync -az --delete dist/ "$HOST:$DIR/dist/"
rsync -az deploy/docker-compose.yml "$HOST:$DIR/"
rsync -az --delete deploy/conf/ "$HOST:$DIR/conf/"

echo "→ поднимаю контейнер"
# nginx.conf примонтирован файлом, поэтому compose up -d его не заметит:
# определение сервиса не изменилось, контейнер не пересоздаётся, конфиг остаётся старым.
# Перечитываем явно — иначе правки конфига применяются молча никогда.
ssh "$HOST" "cd $DIR && docker compose up -d && docker compose exec -T review-after-ai nginx -s reload && docker compose ps"

echo "✓ готово"
