# roy — invite-only AI chatbot

Phase 0 of the [implementation plan](./docs/implementation-plan.md): a reusable
infrastructure baseline for Docker, Ollama, Postgres, Redis, and HTTPS ingress.

No AI, auth, or app code yet — that's Phase 1+.

Important: the files in this repo currently reflect a `fresh-host` baseline more
than a `live-host` deployment. On a machine that is already serving other
Docker workloads, do not blindly run `scripts/bootstrap-server.sh` or assume the
default host port bindings are safe. The updated
[implementation plan](./docs/implementation-plan.md) describes the required
live-host adjustments.

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
├── Caddyfile.fresh-host       # Caddy config for fresh-host only
├── docker-compose.yml              # internal-only base stack
├── docker-compose.fresh-host.yml   # owns 80/443 with Caddy
├── docker-compose.live-host.yml    # localhost web binding for existing ingress
├── docker-compose.admin-ports.yml  # optional localhost DB/Redis/Ollama ports
├── .env.example
└── README.md
```

## Prerequisites

- A server running Ubuntu 24.04 with an NVIDIA GPU and the proprietary driver installed (`nvidia-smi` must work on the host).
- Root/sudo access.
- A domain pointing at the server's public IP. This repo assumes `roy.rxstud.io` — set an `A` record to the server's IPv4 (and `AAAA` if you're on IPv6) **before** first boot, or Caddy's ACME challenge will fail and you'll serve plain HTTP.
- Ports 80 and 443 open to the public internet.

## Deployment modes

This repo now has a shared base compose file and deployment-specific overlays.

### `fresh-host`

Use this when the stack owns ingress on a new or disposable machine.

```bash
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml up -d
```

This mode:

- starts Caddy on public `80/443` using `Caddyfile.fresh-host`
- publishes Postgres, Redis, and Ollama on localhost
- matches the original Phase 0 assumptions

### `live-host`

Use this on a server that is already running other Docker workloads.

```bash
docker compose -f docker-compose.yml -f docker-compose.live-host.yml up -d
```

This mode:

- does not claim `80/443`
- exposes only the web service on `127.0.0.1:${WEB_HOST_PORT:-3004}`
- expects an existing reverse proxy, tunnel, or ingress layer to publish it

### Optional admin ports

If you also want direct localhost access to Postgres, Redis, or Ollama, add:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.live-host.yml \
  -f docker-compose.admin-ports.yml \
  up -d
```

Defaults in `docker-compose.admin-ports.yml` avoid the ports already occupied
on the current host.

## First-time bring-up

These steps are for a new or disposable host.

```bash
# 1. Get the repo onto the server (adjust for your workflow)
git clone <your-remote> /opt/roy && cd /opt/roy
# OR: scp -r ai-chatbot/ user@server:/opt/roy && ssh user@server && cd /opt/roy

# 2. Fresh host only: install Docker + NVIDIA Container Toolkit + firewall
#    rules. The script now requires an explicit fresh-host acknowledgement and
#    will abort if the machine already looks like a live Docker host.
sudo ./scripts/bootstrap-server.sh --fresh-host

# 3. Configure secrets.
cp .env.example .env
# Generate fresh passwords:
#   openssl rand -base64 32
# Edit .env and set POSTGRES_PASSWORD, REDIS_PASSWORD, and re-build DATABASE_URL/REDIS_URL.

# 4. Start the stack in fresh-host mode.
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml up -d
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml ps
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml logs -f caddy

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
curl -sS http://localhost:${OLLAMA_HOST_PORT:-11434}/api/generate \
  -d '{"model":"qwen2.5:7b-instruct-q4_K_M","prompt":"hello","stream":false}' \
  | jq -r '.response'
```

If all three pass, Phase 0 is done. Move on to Phase 1 (auth + admin).

## Live-host bring-up

Use this path on an already-running server.

```bash
# 1. Get the repo onto the server and create .env.
git clone <your-remote> /opt/roy && cd /opt/roy
cp .env.example .env

# 2. Choose a localhost port for the web service if 3004 is not suitable.
# WEB_HOST_PORT=3004

# Do not run scripts/bootstrap-server.sh here; it is fresh-host-only by design.

# 3. Start only the live-host overlay.
docker compose -f docker-compose.yml -f docker-compose.live-host.yml up -d

# 4. Optional: expose Postgres/Redis/Ollama on localhost using safe alternate ports.
docker compose \
  -f docker-compose.yml \
  -f docker-compose.live-host.yml \
  -f docker-compose.admin-ports.yml \
  up -d
```

## Day-to-day operations

### Start / stop / restart

```bash
# Fresh host:
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml up -d
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml down
docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml restart caddy

# Live host:
docker compose -f docker-compose.yml -f docker-compose.live-host.yml up -d
docker compose -f docker-compose.yml -f docker-compose.live-host.yml down

# Follow logs for either mode by repeating the same `-f` file set you used on startup.
docker compose -f docker-compose.yml -f docker-compose.live-host.yml logs -f web
```

### Updating

Containers are pinned to specific versions in the compose files on purpose — no surprise upgrades. To update:

1. Bump the image tag in the relevant compose file.
2. Re-run `docker compose pull` and `docker compose up -d` with the same `-f`
   file set you used to start the stack.
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

**Caddy is serving HTTP but not HTTPS.** DNS probably didn't resolve when the container started. Fix DNS, then `docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml restart caddy`. Watch `docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml logs caddy` — ACME errors are verbose and usually self-explanatory.

This applies only to `fresh-host` mode.

**`docker run --gpus all ...` fails.** Driver/toolkit mismatch. Run `nvidia-smi` on the host first; if that works but the container doesn't, re-run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.

**Ollama is slow on first request.** Normal — the model has to load into VRAM. `OLLAMA_KEEP_ALIVE=30m` in `docker-compose.yml` keeps it hot between requests.

**`docker compose up` fails with "variable is not set".** You didn't fill in `.env`. `compose` will tell you exactly which variable.

**Out of disk.** Ollama models are big (~5GB for Qwen2.5-7B Q4, ~275MB for nomic-embed). `docker system df` shows what's using space; `docker compose exec ollama ollama list` shows installed models.

## What's coming next

- **Phase 1** — Next.js + Auth.js with invite-only registration and an admin dashboard. Replaces `web-placeholder` with the real app.
- **Phase 2** — First streaming chat against Ollama.
- See [implementation-plan.md](./docs/implementation-plan.md) for the full roadmap.
