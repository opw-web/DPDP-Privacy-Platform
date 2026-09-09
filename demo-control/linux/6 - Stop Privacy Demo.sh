#!/usr/bin/env bash
# Linux entry point for "6 - Stop Privacy Demo".
#
# The Windows launchers in the repository root call demo-control/stop.sh
# directly; this wrapper is the same one-line hand-over for Linux, kept
# out of the root so a client's unzipped folder shows nothing but the
# numbered .cmd files.
set -u
CONTROL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec /bin/bash "$CONTROL/stop.sh"
