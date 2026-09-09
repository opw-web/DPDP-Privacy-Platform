#!/usr/bin/env bash
# Linux entry point for "9 - Reset Demo to Fresh State".
#
# The Windows launchers in the repository root call demo-control/reset.sh
# directly; this wrapper is the same one-line hand-over for Linux, kept
# out of the root so a client's unzipped folder shows nothing but the
# numbered .cmd files.
set -u
CONTROL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec /bin/bash "$CONTROL/reset.sh"
