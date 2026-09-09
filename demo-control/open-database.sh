#!/usr/bin/env bash
# "Open Database" -- opens Prisma Studio, a table browser for the demo
# database, in the default web browser. No SQL, no terminal: click a
# table name on the left, read the rows on the right.
#
# Read-only in spirit (Studio can edit, but nothing here tells it to).
# Started on demand; "Stop Privacy Demo" shuts it down again.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Open the Demo Database"
echo "======================================================"
echo

setup_node

step "Database"
ensure_database_up || exit 1

step "Database browser"
ensure_studio_up || exit 1

step "Opening it in your browser"
open_url "$STUDIO_URL"
ok "Opened $STUDIO_URL"

echo
say "What you are looking at:"
say "  The left-hand list is every table in the demo database. Each table"
say "  is one kind of thing the platform stores. Click a name to see its"
say "  rows; each row is one record."
echo
say "The five tables worth showing:"
say "  DataPrincipal ..... one row per real person the company holds data"
say "                      about. This is the 327 the dashboard counts."
say "  SourceRecord ...... the 500 untouched rows exactly as they came out"
say "                      of the four source systems. Nothing is edited."
say "  NoticeVersion ..... each published privacy notice, frozen. A published"
say "                      version can never be changed, only superseded."
say "  ConsentRecord ..... every consent given, refused or withdrawn, with"
say "                      the exact notice version the person was shown."
say "  AuditEvent ........ the append-only log. Every row carries the hash of"
say "                      the row before it, so a deletion or an edit shows."
echo
say "The browser keeps running on its own -- this window can be closed"
say "straight away. 'Stop Privacy Demo' shuts it down with everything else."

trap - EXIT
pause_before_exit
