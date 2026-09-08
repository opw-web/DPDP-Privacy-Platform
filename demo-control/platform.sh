#!/usr/bin/env bash
# Cross-platform primitives for the Privacy Demo control scripts.
#
# This file is SOURCED by common.sh before anything else. It exists so that
# every OS difference lives in exactly one place: the rest of the control
# layer (start, stop, status, reset, stage-demo, show-demo-proof) calls these
# helpers and never names an OS-specific tool directly.
#
# Two supported platforms:
#   Linux  -- the original behaviour, unchanged in every respect.
#   Windows -- run through Git Bash (MSYS2), which supplies bash, GNU
#              coreutils (date -d, %-I, %3N all work) and curl.
#
# The Windows branches were verified on Windows 11 / Git for Windows:
#   - a native process started from a background subshell survives the
#     launching shell exiting, so `setsid` is neither available nor needed;
#   - `netstat -ano` plus awk gives the PID listening on a port;
#   - `taskkill /PID n /T [/F]` terminates it.

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
  *)                    IS_WINDOWS=0 ;;
esac

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
# Docker Desktop and node.exe are native Windows programs: they do not
# understand the /c/... paths Git Bash hands out. Convert before letting a
# path cross that boundary. On Linux this is the identity function.
winpath() {
  if [ "$IS_WINDOWS" = "1" ]; then
    cygpath -m "$1"
  else
    printf '%s' "$1"
  fi
}

# ---------------------------------------------------------------------
# Opening a URL or a local file in the user's browser
# ---------------------------------------------------------------------
open_url() {
  local target="$1"
  if [ "$IS_WINDOWS" = "1" ]; then
    # A local file has to be handed over as a Windows path; a URL must be
    # left exactly as it is. The empty "" is start's title argument -- without
    # it, a quoted target is taken as the window title and nothing opens.
    case "$target" in
      http://*|https://*|file://*) : ;;
      *) target="$(winpath "$target")" ;;
    esac
    ( MSYS_NO_PATHCONV=1 cmd //c start "" "$target" >/dev/null 2>&1 & )
  else
    xdg-open "$target" >/dev/null 2>&1 &
  fi
}

# ---------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------
# On Linux every docker call goes through `sg docker` so the demo never needs
# sudo and never prompts for a password. Windows has no unix group model and
# Docker Desktop needs no such wrapper.
docker_run() {
  if [ "$IS_WINDOWS" = "1" ]; then
    MSYS_NO_PATHCONV=1 docker "$@"
  else
    sg docker -c "docker $*"
  fi
}

# `docker compose` scoped to dpdp-platform/docker-compose.yml.
compose() {
  if [ "$IS_WINDOWS" = "1" ]; then
    # cd instead of --project-directory: it keeps a Windows-style path out of
    # the command line entirely, which is what MSYS would otherwise mangle.
    ( cd "$COMPOSE_DIR" && MSYS_NO_PATHCONV=1 docker compose -f docker-compose.yml "$@" )
  else
    # Never cd on Linux -- avoids nested-quoting problems with the space in
    # the repo path when the whole command is handed to `sg docker -c`.
    sg docker -c "docker compose --project-directory \"$COMPOSE_DIR\" -f \"$COMPOSE_FILE\" $*"
  fi
}

# One query against the demo database, printed as a bare value ("?" on any
# failure). Runs psql *inside* the postgres container, so no PostgreSQL client
# tools need to be installed on the host -- on either platform.
psql_q() {
  local sql="$1" out
  if [ "$IS_WINDOWS" = "1" ]; then
    out=$(MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=dpdp "$PG_CONTAINER" \
            psql -U dpdp -d dpdp -tAc "$sql" 2>/dev/null)
  else
    # printf %q re-quotes the SQL so it survives being re-parsed by `sg -c`.
    out=$(sg docker -c "docker exec -e PGPASSWORD=dpdp $PG_CONTAINER psql -U dpdp -d dpdp -tAc $(printf '%q' "$sql")" 2>/dev/null)
  fi
  out=$(printf '%s' "$out" | tr -d ' \r')
  if [ -n "$out" ]; then printf '%s' "$out"; else printf '?'; fi
}

# ---------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------
setup_node() {
  if [ "$IS_WINDOWS" = "1" ]; then
    # nvm-windows is a completely different program with no nvm.sh to source,
    # so on Windows Node 20 is expected to be installed normally and on PATH.
    if ! command -v node >/dev/null 2>&1; then
      echo "!! Node.js is not on PATH."
      echo "!! Install Node.js 20 from https://nodejs.org/ then reopen this window."
      return 1
    fi
    return 0
  fi
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
}

# ---------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------
# The control scripts parse JSON with small python one-liners. Resolve a
# working interpreter once and reuse it.
DEMO_PY="${DEMO_PY:-}"

resolve_python() {
  [ -n "$DEMO_PY" ] && return 0
  local candidate
  for candidate in python3 python py; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    # `command -v` alone is not enough on Windows: python3 and python on PATH
    # are frequently Microsoft Store "App Execution Alias" stubs, which
    # resolve happily and then refuse to run. Only an interpreter that
    # actually executes something counts as installed.
    if [ "$candidate" = "py" ]; then
      if py -3 -c "pass" >/dev/null 2>&1; then DEMO_PY="py -3"; return 0; fi
    else
      if "$candidate" -c "pass" >/dev/null 2>&1; then DEMO_PY="$candidate"; return 0; fi
    fi
  done
  return 1
}

# Run the resolved interpreter. Drop-in replacement for a literal `python3`.
py_run() {
  resolve_python || return 1
  # shellcheck disable=SC2086
  $DEMO_PY "$@"
}

# The message shown when no usable Python was found, including the Windows
# Store-stub case, which is by far the most confusing way for this to fail.
python_help_text() {
  if [ "$IS_WINDOWS" = "1" ]; then
    echo "Python 3 is not usable on this computer."
    echo "  1. Install Python 3 from https://www.python.org/downloads/windows/"
    echo "     and tick 'Add python.exe to PATH' during setup."
    echo "  2. If 'python' still does nothing, turn off the Microsoft Store"
    echo "     shortcuts: Settings > Apps > Advanced app settings >"
    echo "     App execution aliases -- switch off both Python entries."
  else
    echo "Python 3 is missing. Ask the computer administrator to install: python3"
  fi
}

# ---------------------------------------------------------------------
# Processes and ports
# ---------------------------------------------------------------------
# The PID listening on a TCP port, or empty.
port_pid() {
  local port="$1"
  if [ "$IS_WINDOWS" = "1" ]; then
    MSYS_NO_PATHCONV=1 netstat -ano 2>/dev/null \
      | awk -v p=":${port}\$" 'toupper($0) ~ /LISTENING/ && $2 ~ p { print $5; exit }'
  else
    fuser "${port}/tcp" 2>/dev/null | tr -d ' '
  fi
}

pid_alive() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  if [ "$IS_WINDOWS" = "1" ]; then
    MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $pid" /NH 2>/dev/null \
      | awk -v want="$pid" 'NF && $2 == want { found = 1 } END { exit !found }'
  else
    kill -0 "$pid" 2>/dev/null
  fi
}

# kill_pid PID [force]
#
# On Windows there is no SIGTERM. `taskkill` without /F asks a window to
# close, and these services are windowless, so the polite form is simply a
# no-op that then times out and forces anyway -- reported to the user as
# "did not stop gracefully", which reads like a fault when it is just how
# Windows works. So on Windows the first ask is already the real one.
kill_pid() {
  local pid="$1" force="${2:-}"
  [ -n "$pid" ] || return 0
  if [ "$IS_WINDOWS" = "1" ]; then
    MSYS_NO_PATHCONV=1 taskkill /PID "$pid" /T /F >/dev/null 2>&1 || true
  else
    if [ "$force" = "force" ]; then
      kill -9 "$pid" 2>/dev/null || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  fi
}

# run_detached DIR LOGFILE COMMAND [ARGS...]
# Start a long-running service that must outlive this script.
run_detached() {
  local dir="$1" log="$2"
  shift 2
  if [ "$IS_WINDOWS" = "1" ]; then
    # On Windows `npm` and `npx` are MSYS shell scripts; the .cmd shims are
    # native, so the service ends up a plain Windows process.
    local exe="$1"
    shift
    case "$exe" in
      npm|npx|yarn|pnpm)
        if command -v "$exe.cmd" >/dev/null 2>&1; then exe="$exe.cmd"; fi
        ;;
    esac

    # A plain `( cmd & )` is NOT enough here. The child survives, but it also
    # keeps the launching bash alive and holds that shell's console and
    # stdout handles -- so the demo window never closes and the script that
    # started the service never returns. setsid solves this on Linux; MSYS
    # has no setsid, so hand the job to Start-Process, which gives the
    # service its own handles and its own parent.
    local cmdline="$exe" arg
    for arg in "$@"; do cmdline="$cmdline \"$arg\""; done

    local wdir wlog
    wdir="$(winpath "$dir")"
    wlog="$(winpath "$log")"

    MSYS_NO_PATHCONV=1 powershell -NoProfile -NonInteractive -Command \
      "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c $cmdline 1>>\"$wlog\" 2>&1' -WorkingDirectory '$wdir' -WindowStyle Hidden" \
      >/dev/null 2>&1
  else
    ( cd "$dir" && setsid "$@" >>"$log" 2>&1 </dev/null & )
  fi
}
