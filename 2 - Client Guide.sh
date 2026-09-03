#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUIDE="$ROOT/docs/demo-runbook/CLIENT-GUIDE-standalone.html"
if [ ! -f "$GUIDE" ]; then
  echo "The client guide is missing: $GUIDE"
  read -r -p "Press Enter to close..." _ignored || true
  exit 1
fi
xdg-open "$GUIDE" >/dev/null 2>&1 &
echo "Opening the standalone client guide in your browser."
sleep 2
