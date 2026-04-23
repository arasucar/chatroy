#!/usr/bin/env bash
# Pulls the Phase 0 models into the running ollama container.
#
# Must run after `docker compose up -d ollama` — waits for the container to
# become healthy before issuing pulls. Safe to re-run; `ollama pull` is a
# no-op when the model is already present.
#
# Usage:
#   ./scripts/pull-models.sh
#
# Env overrides (match names in .env.example):
#   OLLAMA_CHAT_MODEL   default: qwen2.5:7b-instruct-q4_K_M
#   OLLAMA_EMBED_MODEL  default: nomic-embed-text

set -euo pipefail

CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:7b-instruct-q4_K_M}"
EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

# Find the compose service name (default in docker-compose.yml is `ollama`,
# with project prefix `roy` → container name `roy-ollama-1`).
container=$(docker compose ps --format json ollama 2>/dev/null | jq -r '.Name // empty' | head -n1)
if [[ -z "$container" ]]; then
  echo "ollama container not running. Start it with: docker compose up -d ollama" >&2
  exit 1
fi

echo "==> Using container: $container"

# Wait for health (up to ~2 min)
echo "==> Waiting for ollama to be healthy"
for i in $(seq 1 24); do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "starting")
  if [[ "$status" == "healthy" ]]; then
    echo "    ollama is healthy."
    break
  fi
  if [[ $i -eq 24 ]]; then
    echo "ollama never became healthy. Check: docker logs $container" >&2
    exit 1
  fi
  sleep 5
done

echo "==> Pulling $CHAT_MODEL (this can take several minutes on first run)"
docker exec "$container" ollama pull "$CHAT_MODEL"

echo "==> Pulling $EMBED_MODEL"
docker exec "$container" ollama pull "$EMBED_MODEL"

echo "==> Installed models:"
docker exec "$container" ollama list

# Smoke test — should return in well under 5s on a warm GPU.
echo "==> Smoke test against $CHAT_MODEL"
start=$(date +%s)
docker exec "$container" ollama run "$CHAT_MODEL" "Say hello in one short sentence." || true
end=$(date +%s)
echo "    (took $((end - start))s)"
