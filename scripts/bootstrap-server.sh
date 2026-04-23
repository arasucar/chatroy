#!/usr/bin/env bash
# Bootstraps an Ubuntu 24.04 host for the Phase 0 stack.
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
# Usage:
#   sudo ./scripts/bootstrap-server.sh
#
# After this completes, verify with:
#   docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

set -euo pipefail

# ── Preflight ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

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
  3. docker compose up -d
  4. ./scripts/pull-models.sh
  5. curl https://\$DOMAIN/healthz   # should print "ok"

If you want to run docker without sudo as your non-root user:
  sudo usermod -aG docker ${SUDO_USER:-\$USER}   # then log out and back in
EOF
