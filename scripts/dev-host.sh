#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

printf '[INFO] Starting development servers with frontend host exposure...\n'
cd "${PROJECT_ROOT}"
npm run dev:host
