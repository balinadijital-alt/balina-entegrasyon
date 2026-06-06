#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required for staging runtime check." >&2
  exit 127
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 https://api-staging.example.com" >&2
  exit 2
fi

BASE_URL="${1%/}"
HEALTH_URL="$BASE_URL/api/health/ready"

health_response="$(curl -fsS --max-time 10 "$HEALTH_URL")"

if ! printf '%s' "$health_response" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "Health check failed: $HEALTH_URL did not return status=healthy." >&2
  echo "$health_response" >&2
  exit 1
fi

missing_checks=0
for check_name in database cache queue storage; do
  if ! printf '%s' "$health_response" | grep -Eq "\"$check_name\"[[:space:]]*:[[:space:]]*\"ok\""; then
    echo "Health check response has non-ok checks.$check_name." >&2
    missing_checks=1
  fi
done

for top_level in queue scheduler; do
  if ! printf '%s' "$health_response" | grep -Eq "\"$top_level\"[[:space:]]*:"; then
    echo "Health check response is missing $top_level field." >&2
    missing_checks=1
  fi
done

if [ "$missing_checks" -ne 0 ]; then
  echo "$health_response" >&2
  exit 1
fi

echo "Health check passed: $HEALTH_URL"

if [ -n "${BALINA_API_TOKEN:-}" ]; then
  QUEUE_URL="$BASE_URL/api/queue/status"
  queue_response="$(curl -fsS --max-time 10 -H "Authorization: Bearer $BALINA_API_TOKEN" -H "Accept: application/json" "$QUEUE_URL")"

  if ! printf '%s' "$queue_response" | grep -Eq '"redis"[[:space:]]*:'; then
    echo "Queue status response is missing redis field." >&2
    echo "$queue_response" >&2
    exit 1
  fi

  if ! printf '%s' "$queue_response" | grep -Eq '"stats"[[:space:]]*:'; then
    echo "Queue status response is missing stats field." >&2
    echo "$queue_response" >&2
    exit 1
  fi

  echo "Queue status check passed: $QUEUE_URL"
else
  echo "Skipping authenticated queue status check because BALINA_API_TOKEN is not set."
fi
