#!/usr/bin/env bash
# Journal hook launcher.
#
# The journal hooks used to invoke `python3` directly. That is not portable:
# on Windows the names python3 and python are normally present on PATH as
# Microsoft Store "App execution alias" stubs, which resolve happily, print
# an advert for the Store, and exit non-zero. For UserPromptSubmit that
# output would be injected straight into the session as context, so simply
# trying python3 and falling back is not good enough -- the interpreter has
# to be probed silently before it is used.
#
# Usage:  run.sh <script-name.py> [args...]
#
# Exits 0 no matter what. A missing journal entry is a nuisance; a hook that
# fails or prints noise breaks the session.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$#" -ge 1 ] || exit 0
target="$SCRIPT_DIR/$1"
shift
[ -f "$target" ] || exit 0

for candidate in python3 python py; do
  command -v "$candidate" >/dev/null 2>&1 || continue
  if [ "$candidate" = "py" ]; then
    if py -3 -c "pass" >/dev/null 2>&1; then
      exec py -3 "$target" "$@"
    fi
  else
    if "$candidate" -c "pass" >/dev/null 2>&1; then
      exec "$candidate" "$target" "$@"
    fi
  fi
done

# No usable Python on this computer -- stay silent.
exit 0
