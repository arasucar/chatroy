#!/usr/bin/env bash
# Smoke-tests the Project 1 localhost streaming endpoint exposed by llm-hello.
#
# Usage:
#   ./scripts/smoke-project1.sh
#   PROMPT="Say hello" ./scripts/smoke-project1.sh
#   LLM_HELLO_HOST_PORT=3010 ./scripts/smoke-project1.sh

set -euo pipefail

HOST="${LLM_HELLO_HOST:-127.0.0.1}"
PORT="${LLM_HELLO_HOST_PORT:-3005}"
PROMPT="${PROMPT:-Say hello from Project 1 in one short sentence.}"
URL="http://${HOST}:${PORT}/api/stream"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to JSON-encode the Project 1 prompt." >&2
  exit 1
fi

echo "==> Streaming from ${URL}"
echo "==> Prompt: ${PROMPT}"

tmp_output=$(mktemp)
trap 'rm -f "$tmp_output"' EXIT

curl -N -sS \
  -H 'content-type: application/json' \
  -d "$(printf '{"prompt":%s}' "$(printf '%s' "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
  "$URL" | tee "$tmp_output"

if ! grep -q '"response"' "$tmp_output"; then
  echo "" >&2
  echo "Project 1 smoke test failed: no streamed response chunks were detected." >&2
  echo "Expected NDJSON from llm-hello at ${URL}." >&2
  exit 1
fi

echo ""
echo "==> Project 1 smoke test OK"
