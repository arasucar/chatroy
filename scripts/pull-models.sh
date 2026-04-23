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

# Resolve the ollama container ID. `docker compose ps -q` is stable across
# compose versions — no jq, no --format json shape drift (it changed from
# array to NDJSON in newer compose releases).
container=$(docker compose ps -q ollama 2>/dev/null || true)
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

# Smoke test — this IS the Phase 0 LLM exit criterion, so failure here means
# the bring-up is not actually done. No `|| true`, no silent success.
echo "==> Smoke test against $CHAT_MODEL"
start=$(date +%s)
if ! docker exec "$container" ollama run "$CHAT_MODEL" "Say hello in one short sentence."; then
  echo "" >&2
  echo "Smoke test FAILED — the model did not respond." >&2
  echo "Debug with:" >&2
  echo "  docker logs $container" >&2
  echo "  docker exec $container nvidia-smi" >&2
  exit 1
fi
end=$(date +%s)
echo "    smoke test OK (took $((end - start))s)"
