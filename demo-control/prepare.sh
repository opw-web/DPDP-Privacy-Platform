#!/usr/bin/env bash
# One-time preparation for a clean GitHub ZIP. Installs project dependencies,
# builds the three Node applications, then creates the complete sample state.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Preparing the DPDP Privacy Platform"
echo "======================================================"
echo
say "This is the one-time setup for a newly downloaded copy."
say "It normally takes about 15 minutes and needs an internet connection."
echo

missing=0
require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$2 is installed."
  else
    warn "$2 is missing. Ask the computer administrator to install: $3"
    missing=1
  fi
}

step "Checking this computer"
require_command docker "Docker" "Docker Engine or Docker Desktop"
require_command psql "PostgreSQL client" "postgresql-client"
require_command curl "Web request tool" "curl"
require_command python3 "Python" "python3"
require_command xdg-open "Browser opener" "xdg-utils"

if [ ! -f "$HOME/.nvm/nvm.sh" ]; then
  warn "Node Version Manager is missing. Ask the computer administrator to install nvm and Node.js 20."
  missing=1
else
  ok "Node Version Manager is installed."
fi

if [ "$missing" != "0" ]; then
  warn "Preparation cannot continue until the missing items above are installed."
  exit 1
fi

setup_node
if [ "$(node --version | cut -d. -f1)" != "v20" ]; then
  warn "Node.js 20 is required, but $(node --version) is active."
  warn "Install it with nvm, then run this preparation again."
  exit 1
fi
ok "Node.js $(node --version) is ready."

if ! docker_run info >/dev/null 2>&1; then
  warn "Docker is installed but is not available to this user."
  warn "Start Docker and make sure this account belongs to the docker group."
  exit 1
fi
ok "Docker is running."

install_packages() {
  local directory="$1" label="$2"
  say "Installing $label packages..."
  if (cd "$directory" && npm ci) >>"$LOG_DIR/prepare.log" 2>&1; then
    ok "$label packages installed."
  else
    warn "$label package installation failed. See $LOG_DIR/prepare.log"
    return 1
  fi
}

step "Installing application packages"
: >"$LOG_DIR/prepare.log"
install_packages "$BACKEND_DIR" "backend" || exit 1
install_packages "$FRONTEND_DIR" "website" || exit 1
install_packages "$DEMO_DIR" "sample company" || exit 1

step "Building the application"
if (cd "$BACKEND_DIR" && npm run build) >>"$LOG_DIR/prepare.log" 2>&1 \
  && (cd "$FRONTEND_DIR" && npm run build) >>"$LOG_DIR/prepare.log" 2>&1 \
  && (cd "$DEMO_DIR" && npm run build) >>"$LOG_DIR/prepare.log" 2>&1; then
  ok "All three application parts built successfully."
else
  warn "The application did not build. See $LOG_DIR/prepare.log"
  exit 1
fi

step "Creating the fictional Acme workspace"
say "The platform will now build its sample database and verify every screen."
say "This is expected to take about 12 minutes."
if ! printf 'YES\n' | env -u DISPLAY bash "$COMMON_SH_DIR/reset.sh"; then
  warn "The sample workspace was not completed."
  exit 1
fi

echo
ok "Preparation complete."
say "Next time, begin with '1 - Start Privacy Demo.sh'."

trap - EXIT
pause_before_exit
