#!/usr/bin/env bash
# Shared helpers for the Privacy Demo control scripts (start.sh, stop.sh,
# reset.sh, status.sh). This file is meant to be SOURCED, never run
# directly -- it defines functions and variables and returns.
#
# Every path below is quoted everywhere it is used, because the repo
# root contains a space ("DPDP app") -- an unquoted path is the single
# most likely way any of these scripts breaks.

set -uo pipefail

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
# Resolve the repo root from this file's own location, so these scripts
# work no matter how they were invoked (double-clicked .desktop file,
# menu entry, or by hand).
COMMON_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$COMMON_SH_DIR/.." && pwd)"

BACKEND_DIR="$REPO_ROOT/dpdp-platform/backend"
FRONTEND_DIR="$REPO_ROOT/dpdp-platform/frontend"
COMPOSE_DIR="$REPO_ROOT/dpdp-platform"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
DEMO_DIR="$REPO_ROOT/demo-company-server"

# State that must NOT live inside the git repo (logs, scratch files).
STATE_DIR="$HOME/.dpdp-demo-control"
LOG_DIR="$STATE_DIR/logs"
SCRATCH_DIR="$STATE_DIR/scratch"
mkdir -p "$LOG_DIR" "$SCRATCH_DIR"

BACKEND_URL="http://localhost:4000"
FRONTEND_URL="http://localhost:5173"
DEMO_URL="http://localhost:5001"
MAILHOG_URL="http://localhost:8025"

ADMIN_EMAIL="admin@acmeretail.demo"
ADMIN_PASSWORD="Password123!"

# ---------------------------------------------------------------------
# Small output helpers -- human sentences, not shell noise.
# ---------------------------------------------------------------------
say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '!! %s\n' "$*"; }
ok()   { printf '   %s\n' "$*"; }

pause_before_exit() {
  echo
  say "You can close this window now."
  read -r -p "Press Enter to close..." _ignored || true
}

# Print a friendly message and hold the window open on any unexpected
# failure, so a double-clicking user always sees *something* readable
# rather than a window that vanishes on error.
on_error() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo
    warn "Something went wrong (exit code $exit_code)."
    warn "Full logs are in: $LOG_DIR"
  fi
  pause_before_exit
}

# ---------------------------------------------------------------------
# Node / Docker setup
# ---------------------------------------------------------------------
setup_node() {
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
}

# Runs a docker command as a member of the `docker` group -- never sudo,
# never a password prompt.
docker_run() {
  sg docker -c "docker $*"
}

# Runs `docker compose` scoped to dpdp-platform/docker-compose.yml,
# without ever `cd`-ing (avoids nested-quoting problems with the space
# in the repo path).
compose() {
  sg docker -c "docker compose --project-directory \"$COMPOSE_DIR\" -f \"$COMPOSE_FILE\" $*"
}

# ---------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------
http_code() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo 000
}

# Poll a URL until it answers 200, or give up after $timeout seconds.
wait_for_http() {
  local url="$1" label="$2" timeout="${3:-60}"
  local waited=0
  while true; do
    if [ "$(http_code "$url")" = "200" ]; then
      return 0
    fi
    if [ "$waited" -ge "$timeout" ]; then
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
    if [ $((waited % 10)) -eq 0 ]; then
      say "   ...still waiting for $label ($waited s elapsed, giving up at ${timeout}s)"
    fi
  done
}

backend_healthy()  { [ "$(http_code "$BACKEND_URL/api/health")" = "200" ]; }
frontend_healthy() { [ "$(http_code "$FRONTEND_URL")" = "200" ]; }
demo_healthy()     { [ "$(http_code "$DEMO_URL/health")" = "200" ]; }

# ---------------------------------------------------------------------
# Process management by (pattern, expected cwd) -- NOT by port alone,
# so we never accidentally signal an unrelated process (e.g. the
# leftover dpdp-step6-* investigation containers/processes, which run
# the exact same "node dist/server.js" command line but out of a
# different working directory and must be left alone).
# ---------------------------------------------------------------------
pids_for() {
  local pattern="$1" expected_cwd="$2"
  local pid cwd
  for pid in $(pgrep -f "$pattern" 2>/dev/null); do
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
    if [ "$cwd" = "$expected_cwd" ]; then
      echo "$pid"
    fi
  done
}

is_running() {
  local pattern="$1" expected_cwd="$2"
  [ -n "$(pids_for "$pattern" "$expected_cwd")" ]
}

stop_by_cwd() {
  local pattern="$1" expected_cwd="$2" label="$3"
  local pids
  pids=$(pids_for "$pattern" "$expected_cwd")
  if [ -z "$pids" ]; then
    ok "$label was not running."
    return 0
  fi
  say "Stopping $label..."
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  local waited=0
  while [ -n "$(pids_for "$pattern" "$expected_cwd")" ] && [ "$waited" -lt 15 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  pids=$(pids_for "$pattern" "$expected_cwd")
  if [ -n "$pids" ]; then
    warn "$label did not stop gracefully, forcing it to stop..."
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
  ok "$label stopped."
}

# If a port is occupied by something that is NOT one of our own
# processes (identified by pattern+cwd) and is not answering health
# checks correctly, free it rather than failing with EADDRINUSE.
free_port_if_stale() {
  local port="$1" label="$2"
  local pid
  pid=$(fuser "${port}/tcp" 2>/dev/null | tr -d ' ')
  if [ -z "$pid" ]; then
    return 0
  fi
  warn "Port $port ($label) is occupied by an unrecognised process (PID $pid). Stopping it so the demo can use this port..."
  kill $pid 2>/dev/null || true
  sleep 2
  if fuser "${port}/tcp" >/dev/null 2>&1; then
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
}

# ---------------------------------------------------------------------
# Starting each service. Shared by start.sh and reset.sh so the two
# scripts can never drift apart on how a service is brought up.
# Each function is idempotent: if the service already answers its
# health check, it does nothing but say so.
# ---------------------------------------------------------------------
ensure_database_up() {
  say "Starting the database, cache and mail catcher (Docker)..."
  compose up -d postgres redis mailhog >>"$LOG_DIR/containers.log" 2>&1
  say "Waiting for the database to be ready..."
  local waited=0
  until docker_run exec dpdp-platform-postgres-1 pg_isready -U dpdp >/dev/null 2>&1; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge 60 ]; then
      warn "The database did not become ready within 60 seconds."
      return 1
    fi
  done
  ok "Database, cache and mail catcher are ready."
}

ensure_backend_up() {
  if backend_healthy; then
    ok "Backend API is already running."
    return 0
  fi
  if fuser "4000/tcp" >/dev/null 2>&1 && ! backend_healthy; then
    free_port_if_stale 4000 "backend API"
  fi
  say "Applying any pending database changes..."
  ( cd "$BACKEND_DIR" && npx prisma migrate deploy ) >>"$LOG_DIR/backend.log" 2>&1
  if [ ! -f "$BACKEND_DIR/dist/main.js" ]; then
    say "Building the backend (first run only, this can take a minute)..."
    ( cd "$BACKEND_DIR" && npm run build ) >>"$LOG_DIR/backend.log" 2>&1
  fi
  say "Starting the backend API..."
  ( cd "$BACKEND_DIR" && setsid node dist/main.js >>"$LOG_DIR/backend.log" 2>&1 </dev/null & )
  say "Waiting for the backend API to come up (this takes about 20 seconds)..."
  if wait_for_http "$BACKEND_URL/api/health" "the backend API" 60; then
    ok "Backend API is ready."
  else
    warn "The backend API did not come up within 60 seconds. Check $LOG_DIR/backend.log"
    return 1
  fi
}

ensure_demo_company_up() {
  if demo_healthy; then
    ok "Demo company server is already running."
    return 0
  fi
  if fuser "5001/tcp" >/dev/null 2>&1 && ! demo_healthy; then
    free_port_if_stale 5001 "demo company server"
  fi
  if [ ! -f "$DEMO_DIR/dist/server.js" ]; then
    say "Building the demo company server (first run only)..."
    ( cd "$DEMO_DIR" && npm run build ) >>"$LOG_DIR/demo-company.log" 2>&1
  fi
  say "Starting the demo company server..."
  ( cd "$DEMO_DIR" && setsid node dist/server.js >>"$LOG_DIR/demo-company.log" 2>&1 </dev/null & )
  say "Waiting for the demo company server to come up..."
  if wait_for_http "$DEMO_URL/health" "the demo company server" 30; then
    ok "Demo company server is ready."
  else
    warn "The demo company server did not come up within 30 seconds. Check $LOG_DIR/demo-company.log"
    return 1
  fi
}

ensure_frontend_up() {
  if frontend_healthy; then
    ok "Platform website is already running."
    return 0
  fi
  if fuser "5173/tcp" >/dev/null 2>&1 && ! frontend_healthy; then
    free_port_if_stale 5173 "platform website"
  fi
  say "Starting the platform website..."
  ( cd "$FRONTEND_DIR" && setsid npm run dev >>"$LOG_DIR/frontend.log" 2>&1 </dev/null & )
  say "Waiting for the platform website to come up (this takes about 20 seconds)..."
  if wait_for_http "$FRONTEND_URL" "the platform website" 60; then
    ok "Platform website is ready."
  else
    warn "The platform website did not come up within 60 seconds. Check $LOG_DIR/frontend.log"
    return 1
  fi
}
