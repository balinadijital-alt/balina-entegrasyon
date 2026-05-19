#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required for deploy health check." >&2
  exit 127
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 https://api.example.com" >&2
  exit 2
fi

BASE_URL="${1%/}"
HEALTH_URL="$BASE_URL/api/health"

response="$(curl -fsS --max-time 10 "$HEALTH_URL")"

if ! printf '%s' "$response" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "Health check failed: $HEALTH_URL did not return status=healthy." >&2
  echo "$response" >&2
  exit 1
fi

echo "Health check passed: $HEALTH_URL"
