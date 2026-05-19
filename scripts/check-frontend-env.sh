#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 frontend/dist https://api-staging.example.com/api" >&2
  exit 2
fi

DIST_PATH="$1"
EXPECTED_API_URL="$2"

if [ ! -d "$DIST_PATH" ]; then
  echo "Error: dist path does not exist: $DIST_PATH" >&2
  exit 1
fi

if ! grep -R --binary-files=without-match -Fq "$EXPECTED_API_URL" "$DIST_PATH"; then
  echo "Error: expected API URL was not found in frontend build artifacts: $EXPECTED_API_URL" >&2
  exit 1
fi

if grep -R --binary-files=without-match -Eq '127\.0\.0\.1:8000/api|localhost:8000/api' "$DIST_PATH"; then
  echo "Error: local API fallback was found in frontend build artifacts." >&2
  exit 1
fi

echo "Frontend API URL check passed: $EXPECTED_API_URL"
