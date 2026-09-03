#!/usr/bin/env bash
# "Install the demo buttons" -- copies the .desktop launchers onto the
# Desktop and into the applications menu, and marks them trusted so a
# double-click runs them instead of asking what to do with the file.
#
# Run this once after cloning, and again if the repo ever moves: the
# Exec= line inside each launcher is an absolute path, and this script
# rewrites it from wherever the repo actually is right now.
#
# It also removes the older, unnumbered launchers from a previous
# install, so the Desktop does not end up with two of each.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
APPS_DIR="$HOME/.local/share/applications"
SRC_DIR="$COMMON_SH_DIR/desktop"

echo "======================================================"
echo " Installing the demo buttons"
echo "======================================================"
echo
say "Repo location: $REPO_ROOT"
say "Desktop:       $DESKTOP_DIR"
say "Menu:          $APPS_DIR"

mkdir -p "$DESKTOP_DIR" "$APPS_DIR"

# The pre-renumbering names. Removed so there is exactly one of each.
OLD_NAMES=(
  start-privacy-demo.desktop
  stop-privacy-demo.desktop
  reset-demo-to-fresh-state.desktop
  demo-status.desktop
)

step "Removing any older copies"
removed=0
for old in "${OLD_NAMES[@]}"; do
  for dir in "$DESKTOP_DIR" "$APPS_DIR"; do
    if [ -f "$dir/$old" ]; then
      rm -f "$dir/$old"
      ok "Removed $dir/$old"
      removed=1
    fi
  done
done
[ "$removed" = "0" ] && ok "None found -- nothing to remove."

step "Installing the seven buttons"
count=0
for src in "$SRC_DIR"/*.desktop; do
  base=$(basename "$src")
  for dir in "$DESKTOP_DIR" "$APPS_DIR"; do
    # Rewrite Exec= from the repo's real location, so this works even if
    # the folder has been moved or renamed since the file was committed.
    sed "s|^Exec=.*/demo-control/|Exec=/bin/bash \"$REPO_ROOT/demo-control/|" "$src" \
      | sed 's|^\(Exec=/bin/bash "[^"]*demo-control/[a-z-]*\.sh\).*|\1"|' \
      > "$dir/$base"
    chmod +x "$dir/$base"
    # Marking it trusted is what turns "Untrusted application launcher"
    # into a button that just runs when double-clicked.
    gio set "$dir/$base" metadata::trusted true 2>/dev/null || true
  done
  name=$(grep -m1 '^Name=' "$src" | cut -d= -f2-)
  ok "$name"
  count=$((count + 1))
done

echo
say "Installed $count buttons. They are on your Desktop, in this order:"
echo
say "  1 - Start Privacy Demo          starts everything, opens the website"
say "  2 - Demo Runbook                the step-by-step guide"
say "  3 - Open Database               browse the tables"
say "  4 - Show Demo Proof             live counts in a window"
say "  5 - Demo Status                 what is up, what is down"
say "  6 - Stop Privacy Demo           shut it all down"
say "  9 - Reset Demo to Fresh State   DESTROYS everything and rebuilds"
echo
say "If a button still says it is untrusted, right-click it once and"
say "choose 'Allow Launching'. That only ever needs doing once."

trap - EXIT
pause_before_exit
