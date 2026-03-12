#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="SVG Viewer Workbench"
STATE_DIR="$SCRIPT_DIR/.next/codex-harness"
LOG_FILE="$STATE_DIR/dev-server.log"
PID_FILE="$STATE_DIR/dev-server.pid"
PORT_FILE="$STATE_DIR/dev-server.port"
PORT_RANGE_START=3000
PORT_RANGE_END=3010
STARTUP_TIMEOUT_SECONDS=60

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "init.sh error: missing required command '$1'." >&2
    exit 1
  fi
}

response_contains_app() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}" 2>/dev/null | grep -q "$APP_NAME"
}

find_running_app_port() {
  local port
  for ((port=PORT_RANGE_START; port<=PORT_RANGE_END; port+=1)); do
    if response_contains_app "$port"; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

extract_port_from_log() {
  if [[ ! -f "$LOG_FILE" ]]; then
    return 1
  fi

  grep -Eo 'http://localhost:[0-9]+' "$LOG_FILE" | tail -n 1 | sed -E 's#http://localhost:##'
}

wait_for_server() {
  local pid="$1"
  local elapsed=0

  while (( elapsed < STARTUP_TIMEOUT_SECONDS )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "init.sh error: dev server exited before becoming healthy." >&2
      [[ -f "$LOG_FILE" ]] && tail -n 80 "$LOG_FILE" >&2
      exit 1
    fi

    local port=""
    port="$(extract_port_from_log || true)"

    if [[ -n "$port" ]] && response_contains_app "$port"; then
      echo "$port"
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "init.sh error: timed out waiting for the dev server to become healthy." >&2
  [[ -f "$LOG_FILE" ]] && tail -n 80 "$LOG_FILE" >&2
  exit 1
}

require_command node
require_command npm
require_command curl
require_command grep
require_command sed

if [[ ! -f package.json ]]; then
  echo "init.sh error: package.json was not found in $SCRIPT_DIR." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies with npm ci..."
  npm ci
fi

mkdir -p "$STATE_DIR"

if running_port="$(find_running_app_port)"; then
  printf '%s\n' "$running_port" > "$PORT_FILE"
  echo "Reusing running app server."
  echo "URL: http://127.0.0.1:${running_port}"
  echo "Health: OK"
  exit 0
fi

echo "Starting local app server..."
: > "$LOG_FILE"
npm run dev >"$LOG_FILE" 2>&1 &
server_pid=$!
printf '%s\n' "$server_pid" > "$PID_FILE"

ready_port="$(wait_for_server "$server_pid")"
printf '%s\n' "$ready_port" > "$PORT_FILE"

echo "Started app server."
echo "PID: $server_pid"
echo "URL: http://127.0.0.1:${ready_port}"
echo "Health: OK"
echo "Log: $LOG_FILE"
