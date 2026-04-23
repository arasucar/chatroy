#!/usr/bin/env bash
# Exports parse-only defaults so Project 1 compose commands can run without a
# full `.env`. These values are only for services that Project 1 does not start.

set -euo pipefail

export POSTGRES_USER="${POSTGRES_USER:-roy}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-project1-unused-postgres-password}"
export POSTGRES_DB="${POSTGRES_DB:-roy}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-project1-unused-redis-password}"
export DOMAIN="${DOMAIN:-project1.local}"
export ACME_EMAIL="${ACME_EMAIL:-project1@example.invalid}"
