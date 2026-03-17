#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WATCHER_PID:-}" ]]; then
    kill "${WATCHER_PID}" >/dev/null 2>&1 || true
  fi
}

backend_watcher() {
  # Run wait with errexit disabled so we can handle backend failures explicitly.
  set +e
  wait "${BACKEND_PID}"
  status=$?
  if [[ "${status}" -ne 0 ]]; then
    echo "Backend process (PID ${BACKEND_PID}) exited with status ${status}, stopping frontend..." >&2
    # Terminate all processes in this process group (including frontend and this script).
    kill 0 >/dev/null 2>&1 || true
    exit "${status}"
  fi
}

trap cleanup EXIT INT TERM

cd "${PROJECT_ROOT}"

npm run dev -w backend &
BACKEND_PID=$!

backend_watcher &
WATCHER_PID=$!

npm run dev -w frontend -- "$@"
FRONTEND_STATUS=$?

# Frontend has exited; stop watcher and reap backend if still running.
if [[ -n "${WATCHER_PID:-}" ]]; then
  kill "${WATCHER_PID}" >/dev/null 2>&1 || true
fi
if [[ -n "${BACKEND_PID:-}" ]]; then
  wait "${BACKEND_PID}" >/dev/null 2>&1 || true
fi

exit "${FRONTEND_STATUS}"
