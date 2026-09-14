#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$deploy_dir"

compose=(sudo docker compose --env-file .env.production -f compose.production.yml)

if [[ ! -f .env.production ]]; then
  echo "Missing deploy/.env.production. Copy .env.production.example and replace every placeholder." >&2
  exit 1
fi

mkdir -p runtime/raw-archives runtime/candidate-responses

"${compose[@]}" config --quiet
"${compose[@]}" build --pull app
"${compose[@]}" run --rm --no-deps app pnpm ops:launch-check
"${compose[@]}" run --rm --no-deps app pnpm db:migrate
"${compose[@]}" up -d --remove-orphans app

for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT:-3100}/api/v1/health" >/dev/null; then
    "${compose[@]}" ps
    echo "AI Newspaper is healthy on 127.0.0.1:${APP_PORT:-3100}."
    exit 0
  fi
  sleep 2
done

"${compose[@]}" logs --tail=200 app >&2
exit 1
