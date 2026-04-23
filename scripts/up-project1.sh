#!/usr/bin/env bash
# Starts the Project 1 services (ollama + llm-hello) with the correct compose
# overlay for either live-host or fresh-host mode.
#
# Usage:
#   ./scripts/up-project1.sh
#   MODE=fresh-host ./scripts/up-project1.sh

set -euo pipefail

script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

source "${script_dir}/project1-compose-env.sh"

mode="${MODE:-live-host}"

case "$mode" in
  live-host)
    overlay="docker-compose.live-host.yml"
    ;;
  fresh-host)
    overlay="docker-compose.fresh-host.yml"
    ;;
  *)
    echo "Unsupported MODE: $mode" >&2
    echo "Use MODE=live-host or MODE=fresh-host." >&2
    exit 64
    ;;
esac

echo "==> Starting Project 1 in ${mode} mode"
docker compose \
  --project-directory "$repo_root" \
  --profile project1 \
  -f "${repo_root}/docker-compose.yml" \
  -f "${repo_root}/${overlay}" \
  up -d ollama llm-hello

echo "==> Project 1 services requested:"
echo "    - ollama"
echo "    - llm-hello"
