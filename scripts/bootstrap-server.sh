#!/usr/bin/env bash
# Bootstraps an Ubuntu 24.04 host for the Phase 0 fresh-host stack.
#
# Installs:
#   - Docker Engine + Compose plugin (from docker.com, not the Ubuntu archive)
#   - NVIDIA Container Toolkit
#   - Configures nvidia as the default docker runtime
#
# Idempotent: safe to re-run. Exits non-zero on any failure so you know.
#
# Firewall behavior: this script will NOT reset or reconfigure ufw if you
# already have rules. It only ADDs allow rules for 80/443 (and OpenSSH if ufw
# isn't active yet). If you need a custom SSH port or a different policy,
# set it up yourself first — we'll leave it alone.
#
# Fresh-host only:
#   This script is intentionally NOT safe for an already-busy Docker host. It
#   may restart Docker and opens public HTTP/HTTPS firewall rules.
#
# Usage:
#   sudo ./scripts/bootstrap-server.sh --fresh-host
#
# After this completes, verify with:
#   docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./scripts/bootstrap-server.sh --fresh-host

This script is intentionally limited to fresh-host installs. It may:
  - install or reconfigure Docker
  - restart the Docker daemon
  - open public ufw rules for 80/443

Do not run it on a live Docker host. For that path:
  cp .env.example .env
  docker compose -f docker-compose.yml -f docker-compose.live-host.yml up -d
EOF
}

port_is_listening() {
  local protocol=$1
  local port=$2

  case "$protocol" in
    tcp)
      ss -H -ltn "( sport = :$port )" | grep -q .
      ;;
    udp)
      ss -H -lun "( sport = :$port )" | grep -q .
      ;;
    *)
      echo "Unsupported protocol: $protocol" >&2
      return 1
      ;;
  esac
}

assert_fresh_host_safety() {
  local running_containers=0
  local total_containers=0
  local -a conflicting_ports=()
  local port

  if ! command -v ss >/dev/null 2>&1; then
    echo "The \`ss\` command is required for fresh-host safety checks." >&2
    exit 1
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    running_containers=$(docker ps -q | wc -l | tr -d ' ')
    total_containers=$(docker ps -aq | wc -l | tr -d ' ')

    if (( total_containers > 0 )); then
      cat >&2 <<EOF
Docker is already managing $total_containers container(s) ($running_containers running).
This script is fresh-host-only and will restart Docker during NVIDIA runtime
configuration. Aborting to avoid disrupting an existing live host.

Use the live-host deployment path instead:
  cp .env.example .env
  docker compose -f docker-compose.yml -f docker-compose.live-host.yml up -d
EOF
      exit 1
    fi
  fi

  for port in 80 443 5432 6379 11434; do
    if port_is_listening tcp "$port"; then
      conflicting_ports+=("tcp/$port")
    fi
  done

  if port_is_listening udp 443; then
    conflicting_ports+=("udp/443")
  fi

  if (( ${#conflicting_ports[@]} > 0 )); then
    printf 'Detected listeners on ports reserved by the fresh-host workflow: %s\n' "${conflicting_ports[*]}" >&2
    cat >&2 <<'EOF'
This host does not look fresh enough for the default bootstrap/deploy path.
Free those ports first, or skip this script and use the live-host overlay.
EOF
    exit 1
  fi
}

fresh_host_ack=0

while (( $# > 0 )); do
  case "$1" in
    --fresh-host)
      fresh_host_ack=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
  shift
done

# ── Preflight ───────────────────────────────────────────────────────────────
if (( fresh_host_ack == 0 )); then
  cat >&2 <<'EOF'
Refusing to run without --fresh-host.

This bootstrap path is for new or dedicated hosts only. It may restart Docker
and opens public HTTP/HTTPS firewall rules.
EOF
  usage >&2
  exit 64
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

assert_fresh_host_safety

if ! command -v lsb_release >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y lsb-release
fi

distro=$(lsb_release -is)
release=$(lsb_release -rs)
codename=$(lsb_release -cs)

if [[ "$distro" != "Ubuntu" ]]; then
  echo "This script targets Ubuntu. Detected: $distro $release. Aborting." >&2
  exit 1
fi

echo "==> Bootstrapping Ubuntu $release ($codename)"

# ── NVIDIA driver sanity check ──────────────────────────────────────────────
# The container toolkit exposes whatever driver is on the host; it does not
# install one. If nvidia-smi isn't there, the toolkit install will "succeed"
# but `docker run --gpus all` will fail later with a confusing error.
if ! command -v nvidia-smi >/dev/null 2>&1; then
  cat >&2 <<'EOF'
nvidia-smi not found. Install the NVIDIA driver before running this script:
  sudo ubuntu-drivers install
  sudo reboot
Then re-run this script.
EOF
  exit 1
fi

echo "==> NVIDIA driver present:"
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader

# ── Base packages ───────────────────────────────────────────────────────────
echo "==> Installing base packages"
apt-get update -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  jq \
  ufw

# ── Docker Engine + Compose plugin ──────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $codename stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "==> Docker already installed ($(docker --version))"
fi

# ── NVIDIA Container Toolkit ────────────────────────────────────────────────
if ! command -v nvidia-ctk >/dev/null 2>&1; then
  echo "==> Installing NVIDIA Container Toolkit"
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list

  apt-get update -y
  apt-get install -y nvidia-container-toolkit
else
  echo "==> NVIDIA Container Toolkit already installed"
fi

echo "==> Configuring nvidia runtime for docker"
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# ── Verification ────────────────────────────────────────────────────────────
echo "==> Verifying GPU access from inside a container"
if ! docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi >/tmp/gpu-check.log 2>&1; then
  echo "GPU smoke test failed. Output:" >&2
  cat /tmp/gpu-check.log >&2
  exit 1
fi
echo "    OK — nvidia-smi works inside a container."

# ── Firewall (non-destructive) ──────────────────────────────────────────────
# We add the rules this stack needs; we never reset or reorder what's already
# there. If ufw isn't active yet we enable it WITH an OpenSSH allow so a remote
# session can't lock itself out. If ufw is already active with a custom SSH
# policy (non-standard port, source allowlist, etc.) we leave it alone.
echo "==> Configuring ufw (additive; existing rules preserved)"

ufw_status=$(ufw status | head -n1 || true)

if [[ "$ufw_status" == "Status: inactive" ]]; then
  echo "    ufw is inactive — enabling with OpenSSH + HTTP/HTTPS rules"
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
else
  echo "    ufw is active — adding HTTP/HTTPS rules only (SSH left untouched)"
  # `ufw allow` is idempotent: repeats print "Skipping adding existing rule".
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
fi

ufw status verbose

# ── Post-install hint ───────────────────────────────────────────────────────
cat <<EOF

==> Done.

Next steps:
  1. cp .env.example .env && edit .env
  2. Make sure DNS for \$DOMAIN points to this server (A/AAAA).
  3. docker compose -f docker-compose.yml -f docker-compose.fresh-host.yml up -d
  4. ./scripts/pull-models.sh
  5. curl https://\$DOMAIN/healthz   # should print "ok"

If you want to run docker without sudo as your non-root user:
  sudo usermod -aG docker ${SUDO_USER:-\$USER}   # then log out and back in
EOF
