#!/usr/bin/env bash
# "Demo Status" -- shows at a glance what is up and what is down, and
# the URLs for everything. Read-only: never starts, stops, or changes
# anything.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap pause_before_exit EXIT

echo "======================================================"
echo " DPDP Privacy Demo -- Status"
echo "======================================================"
echo

line() {
  local label="$1" up="$2" url="$3"
  if [ "$up" = "1" ]; then
    printf '  [UP]      %-24s %s\n' "$label" "$url"
  else
    printf '  [DOWN]    %-24s %s\n' "$label" "$url"
  fi
}

if [ "$(http_code "$BACKEND_URL/api/health")" = "200" ]; then backend_up=1; else backend_up=0; fi
if [ "$(http_code "$FRONTEND_URL")" = "200" ]; then frontend_up=1; else frontend_up=0; fi
if [ "$(http_code "$DEMO_URL/health")" = "200" ]; then demo_up=1; else demo_up=0; fi
if [ "$(http_code "$MAILHOG_URL")" = "200" ]; then mailhog_up=1; else mailhog_up=0; fi
if [ "$(http_code "$STUDIO_URL")" = "200" ]; then studio_up=1; else studio_up=0; fi

if docker_run exec dpdp-platform-postgres-1 pg_isready -U dpdp >/dev/null 2>&1; then
  db_up=1
else
  db_up=0
fi

line "Platform website" "$frontend_up" "$FRONTEND_URL"
line "Backend API"      "$backend_up"  "$BACKEND_URL"
line "Demo company data" "$demo_up"    "$DEMO_URL"
line "Mail catcher"     "$mailhog_up"  "$MAILHOG_URL"
line "Database"         "$db_up"       "localhost:5432"
line "Database browser"  "$studio_up"  "$STUDIO_URL"

echo
if [ "$backend_up" = "1" ] && [ "$frontend_up" = "1" ] && [ "$demo_up" = "1" ]; then
  say "Everything the demo needs is UP. You can open the platform website above."
  say "Sign in as: $ADMIN_EMAIL / $ADMIN_PASSWORD"
else
  say "Something is DOWN. Double-click 'Start Privacy Demo' to bring it up."
fi

trap - EXIT
pause_before_exit
