#!/usr/bin/env bash
# "Start Privacy Demo" -- brings up the database, the backend API, the
# frontend, and the demo company server, waits until each one genuinely
# answers, then opens the platform in the browser.
#
# Safe to double-click again while everything is already running: each
# step checks first and just skips ahead if that piece is already up.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Starting the DPDP Privacy Demo"
echo "======================================================"

step "Node.js"
say "Setting up Node.js..."
setup_node
ok "Using Node $(node --version)."

step "Database, cache and mail catcher"
ensure_database_up || exit 1

step "Backend API (port 4000)"
ensure_backend_up || exit 1

step "Demo company data (port 5001)"
ensure_demo_company_up || exit 1

step "Platform website (port 5173)"
ensure_frontend_up || exit 1

step "All set"
say "Opening the demo in your browser..."
xdg-open "$FRONTEND_URL" >/dev/null 2>&1 &
disown || true

echo
say "The Privacy Demo is up:"
say "  Platform website ......... $FRONTEND_URL"
say "  Sign in as ................ $ADMIN_EMAIL / $ADMIN_PASSWORD"
say "  Backend API ............... $BACKEND_URL"
say "  Demo company data ......... $DEMO_URL"
say "  Mail catcher (MailHog) .... $MAILHOG_URL"

trap - EXIT
pause_before_exit
