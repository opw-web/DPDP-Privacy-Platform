#!/usr/bin/env bash
# "Stop Privacy Demo" -- shuts everything down cleanly: the backend API,
# the platform website, the demo company server, and the database/cache/
# mail catcher containers. Safe to double-click even if some or all of
# it is already stopped.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Stopping the DPDP Privacy Demo"
echo "======================================================"

step "Application processes"
stop_by_cwd "dist/main.js"   "$BACKEND_DIR"  "the backend API"
stop_by_cwd "vite"           "$FRONTEND_DIR" "the platform website"
stop_by_cwd "dist/server.js" "$DEMO_DIR"     "the demo company server"

step "Database, cache and mail catcher"
say "Stopping the database, cache and mail catcher (Docker)..."
compose stop postgres redis mailhog >>"$LOG_DIR/containers.log" 2>&1
ok "Database, cache and mail catcher stopped. Your demo data is kept -- Start will bring it back as it was."

echo
say "Everything is stopped."

trap - EXIT
pause_before_exit
