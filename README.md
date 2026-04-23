# roy — invite-only AI chatbot

Phase 0 of the [implementation plan](./implementation-plan.md): a clean server bring-up with Docker, the NVIDIA Container Toolkit, Caddy over HTTPS, Postgres (with pgvector), Redis, and Ollama running locally on the GPU.

No AI, auth, or app code yet — that's Phase 1+. This phase exists so you can nuke the server and restore it cleanly from this repo alone.

## Layout

```
.
├── apps/
│   ├── web/                 # Next.js app (Phase 1)
│   ├── web-placeholder/     # nginx returning 200 on /healthz for Phase 0
│   └── sandbox/             # Fastify code runner (Phase 5)
├── packages/
│   └── shared/              # shared types/schemas (Phase 1+)
├── scripts/
│   ├── bootstrap-server.sh  # one-shot server prep
│   └── pull-models.sh       # pull Ollama models after first boot
├── Caddyfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Prerequisites

- A server running Ubuntu 24.04 with an NVIDIA GPU and the proprietary driver installed (`nvidia-smi` must work on the host).
- Root/sudo access.
- A domain pointing at the server's public IP. This repo assumes `roy.rxstud.io` — set an `A` record to the server's IPv4 (and `AAAA` if you're on IPv6) **before** first boot, or Caddy's ACME challenge will fail and you'll serve plain HTTP.
- Ports 80 and 443 open to the public internet.

## First-time bring-up

```bash
# 1. Get the repo onto the server (adjust for your workflow)
git clone <your-remote> /opt/roy && cd /opt/roy
# OR: scp -r ai-chatbot/ user@server:/opt/roy && ssh user@server && cd /opt/roy

# 2. Install Docker + NVIDIA Container Toolkit + firewall rules.
#    The script is additive on firewalls — it won't reset existing ufw config.
sudo ./scripts/bootstrap-server.sh

# 3. Configure secrets.
cp .env.example .env
# Generate fresh passwords:
#   openssl rand -base64 32
# Edit .env and set POSTGRES_PASSWORD, REDIS_PASSWORD, and re-build DATABASE_URL/REDIS_URL.

# 4. Start the stack.
docker compose up -d
docker compose ps                          # all services healthy?
docker compose logs -f caddy               # watch ACME cert issuance

# 5. Pull the Ollama models (runs inside the ollama container).
./scripts/pull-models.sh
```

## Verify Phase 0 exit criteria

```bash
# (a) Caddy serves the placeholder over HTTPS with a valid cert.
curl -sS https://roy.rxstud.io/healthz
# → ok

# (b) Ollama responds in under ~5s on the warm GPU.
time docker compose exec ollama ollama run qwen2.5:7b-instruct-q4_K_M "hello"

# (c) Ollama's HTTP API is reachable from the host (not the LAN).
curl -sS http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:7b-instruct-q4_K_M","prompt":"hello","stream":false}' \
  | jq -r '.response'
```

If all three pass, Phase 0 is done. Move on to Phase 1 (auth + admin).

## Day-to-day operations

### Start / stop / restart

```bash
docker compose up -d              # start everything
docker compose down               # stop everything (keeps volumes)
docker compose restart caddy      # restart one service
docker compose logs -f <service>  # follow logs
```

### Updating

Containers are pinned to specific versions in `docker-compose.yml` on purpose — no surprise upgrades. To update:

1. Bump the image tag in `docker-compose.yml`.
2. `docker compose pull && docker compose up -d`.
3. If Ollama was updated, models persist in the `ollama_models` volume and don't need re-pulling.

### Managing models

```bash
# List
docker compose exec ollama ollama list

# Add another model
docker compose exec ollama ollama pull llama3.1:8b-instruct-q4_K_M

# Remove one (frees GPU/disk; models are surprisingly large)
docker compose exec ollama ollama rm some-model
```

### Backups

Postgres data lives in the `postgres_data` volume. Nightly backups land in Phase 8; for now:

```bash
# POSTGRES_USER / POSTGRES_DB live inside the container (from compose env),
# not in the host shell. Wrap in `sh -c '...'` with single quotes so the
# variables expand in the container, not on the host.
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "backup-$(date +%F).sql"
```

### Teardown (destructive)

```bash
docker compose down -v    # -v wipes ALL volumes. You'll lose models and Postgres data.
```

## When things break

**Caddy is serving HTTP but not HTTPS.** DNS probably didn't resolve when the container started. Fix DNS, then `docker compose restart caddy`. Watch `docker compose logs caddy` — ACME errors are verbose and usually self-explanatory.

**`docker run --gpus all ...` fails.** Driver/toolkit mismatch. Run `nvidia-smi` on the host first; if that works but the container doesn't, re-run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.

**Ollama is slow on first request.** Normal — the model has to load into VRAM. `OLLAMA_KEEP_ALIVE=30m` in `docker-compose.yml` keeps it hot between requests.

**`docker compose up` fails with "variable is not set".** You didn't fill in `.env`. `compose` will tell you exactly which variable.

**Out of disk.** Ollama models are big (~5GB for Qwen2.5-7B Q4, ~275MB for nomic-embed). `docker system df` shows what's using space; `docker compose exec ollama ollama list` shows installed models.

## What's coming next

- **Phase 1** — Next.js + Auth.js with invite-only registration and an admin dashboard. Replaces `web-placeholder` with the real app.
- **Phase 2** — First streaming chat against Ollama.
- See [implementation-plan.md](./implementation-plan.md) for the full roadmap.
