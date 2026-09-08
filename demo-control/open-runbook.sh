#!/usr/bin/env bash
# "Demo Runbook" -- opens the demo runbook in the default web browser.
# The runbook is a plain HTML file inside the repo; it needs no server
# and no internet, so this works whether or not the demo is running.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh

if [ ! -f "$RUNBOOK_FILE" ]; then
  warn "The runbook file is missing. It should be at:"
  warn "  $RUNBOOK_FILE"
  pause_before_exit
  exit 1
fi

open_url "$RUNBOOK_FILE"
sleep 1
echo "Opening the demo runbook in your browser."
echo "  $RUNBOOK_FILE"
echo
echo "This window closes on its own. The runbook stays open in the browser."
sleep 2
