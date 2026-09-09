#!/usr/bin/env bash
# Linux entry point for "3 - Open Database".
#
# The Windows launchers in the repository root call demo-control/open-database.sh
# directly; this wrapper is the same one-line hand-over for Linux, kept
# out of the root so a client's unzipped folder shows nothing but the
# numbered .cmd files.
set -u
CONTROL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec /bin/bash "$CONTROL/open-database.sh"
