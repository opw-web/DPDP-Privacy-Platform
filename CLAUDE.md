## Platform support

The demo control layer runs on Linux and on Windows (through Git Bash). The
`.sh` scripts are the single source of truth for both — there is no PowerShell
port to keep in sync.

- Every OS difference lives in `demo-control/platform.sh`, which `common.sh`
  sources first. When something needs an OS-specific tool, add a helper there
  rather than branching in a control script.
- `demo-control/*.sh` and the root `N - Name.sh` files are the Linux entry
  points; the root `N - Name (Windows).cmd` files are thin wrappers that find
  Git Bash and run the very same `.sh`. Adding a control script means adding
  both.
- Never call `xdg-open`, `sg docker`, `fuser`, `pgrep`, `/proc`, `setsid`,
  `psql` or `python3` directly. Use `open_url`, `docker_run`/`compose`,
  `port_pid`, `pids_for`, `kill_pid`, `run_detached`, `psql_q` and `py_run`.
- Long-running services must go through `run_detached`. On Windows a plain
  `( cmd & )` is not enough: the child keeps its bash parent alive and holds
  the console, so the launcher never returns. When changing it, test that the
  *launcher exits*, not just that the service survives.
- Test the Windows launchers by running the `.cmd` from a shell that does NOT
  have a hand-injected PATH. File Explorer keeps the PATH it started with, so
  a launcher that works in your terminal can still fail on double-click. The
  `.cmd` files re-read PATH from the registry for exactly this reason.
- `psql_q` runs SQL inside the postgres container, so no PostgreSQL client is
  needed on either host.
- Windows needs Docker Desktop (+ WSL2), Node 20, real Python 3 (not the
  Microsoft Store alias stubs), Git for Windows, and Visual Studio Build Tools
  with the C++ workload — `argon2` has no usable Windows prebuild and is
  compiled during setup. `better-sqlite3` does ship one and needs no compiler.
  Linux keeps nvm + psql + xdg-utils.
- Node 20 is not available in winget; install it from nodejs.org.
- `.gitattributes` forces `*.sh` to LF. Do not commit CRLF shell scripts —
  bash fails on the shebang.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Process journal

./JOURNAL.md is the project's memory across sessions.
- Read the "Now" block before starting work; it is injected automatically at session start.
- Check "Tried and rejected" before proposing an approach.
- NEVER hand-edit anything under "## Log" — hooks own it.
- DO update the block between the journal:pinned markers whenever you finish a task,
  hit a blocker, or change direction. Keep it under ~10 lines and always current:
  Working on / Next up / Blocked / Tried and rejected.
- If a change needs more explanation than the auto-log captures (a non-obvious
  decision, a tradeoff, a workaround), say so in your reply — it lands in the
  turn recap — or add one line to the Now block.
<!-- journal:rules:end -->
