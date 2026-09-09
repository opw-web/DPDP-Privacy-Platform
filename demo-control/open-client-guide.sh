#!/usr/bin/env bash
# "Client Guide" -- opens the guided product evaluation in the default
# web browser.
#
# The standalone build is used deliberately: every screenshot is embedded
# inside that one file, so the guide reads correctly even if it has been
# copied somewhere else on its own. It needs no server and no internet,
# so this works whether or not the demo is running.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh

if [ ! -f "$CLIENT_GUIDE_FILE" ]; then
  warn "The client guide is missing. It should be at:"
  warn "  $CLIENT_GUIDE_FILE"
  pause_before_exit
  exit 1
fi

open_url "$CLIENT_GUIDE_FILE"
sleep 1
echo "Opening the client guide in your browser."
echo "  $CLIENT_GUIDE_FILE"
echo
echo "This window closes on its own. The guide stays open in the browser."
sleep 2
