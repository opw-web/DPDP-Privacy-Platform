# Paste-into-Claude prompt: always-on process journal (`JOURNAL.md`)

Copy everything in the fenced block below into a fresh Claude Code session in the
target project's root. It composes safely with the graphify setup — the hook installer
merges into `.claude/settings.json` instead of overwriting it.

---

```
Set up an always-on PROCESS JOURNAL in THIS project: a human-visible JOURNAL.md at the
repo root that Claude Code hooks keep updated automatically with mini-logs of everything
added or removed, plus the reason each change was made, so a brand-new session can read
it and pick up exactly where the last one left off. Do all of it, verifying each step.
Follow this spec precisely, including the gotchas, which are not optional.

GOAL
- ./JOURNAL.md at the project root (surface level, committed, human-readable).
- A pinned "Now" block at the top: what's in progress, what's next, what's blocked,
  what was already tried and rejected.
- Below it, an append-only chronological log, grouped by session and by turn.
- Every turn's entries sit under a **Why:** line captured from my actual prompt, so the
  log records intent, not just file churn.
- Each entry is one line: timestamp, path, and the delta (+added/-removed lines, file
  created, file deleted/moved, command run).
- Written by hooks, not by discipline: PostToolUse logs the what, UserPromptSubmit
  captures the why, SessionStart injects the journal back into a new session's context.
- Optional Stop/PreCompact hook writes a one-line recap and refreshes the "Now" block.
- Zero-dependency: Python 3 stdlib only. No new packages.

GOTCHAS (honor these — each one is a real failure mode)
1. Hook payloads arrive as JSON on STDIN, not as argv. Every script reads
   json.load(sys.stdin). Fields differ per tool: Write -> tool_input.file_path/content;
   Edit -> file_path/old_string/new_string; MultiEdit -> file_path/edits[];
   NotebookEdit -> notebook_path; Bash -> command. UserPromptSubmit -> prompt.
2. STDOUT IS CONTEXT for UserPromptSubmit and SessionStart. capture_intent.py must print
   NOTHING, ever — a stray print gets injected into every single prompt. session_start.py
   prints exactly one JSON line and nothing else.
3. NEVER exit non-zero. Exit code 2 blocks the tool call (PostToolUse) or the prompt
   (UserPromptSubmit). Wrap every script body in try/except and always sys.exit(0).
   A broken journal must degrade to "no journal", never to "Claude can't work".
4. Do NOT background the PostToolUse logger (no `&`). Unlike a graph rebuild, ordering
   matters here — backgrounded appends interleave and scramble the log. Keep it fast
   instead: stdlib only, no LLM call, no network, <100ms.
5. Feedback loop: writing to JOURNAL.md fires PostToolUse, which writes to JOURNAL.md.
   The logger MUST skip paths under JOURNAL.md and .claude/journal/.
6. Claude issues parallel tool calls, so several hook processes append at once. Open the
   journal in append mode and take an fcntl.flock exclusive lock around every write.
7. Nested-Claude recursion: if wrap_session.py shells out to `claude -p`, that child runs
   in the same project and loads the same Stop hook. Guard with BOTH the payload's
   stop_hook_active flag AND a JOURNAL_NO_SUMMARY=1 env var set on the child. Skipping
   this can fork Claude processes until the machine chokes.
8. $CLAUDE_PROJECT_DIR is only defined for hooks declared in PROJECT settings, and paths
   can contain spaces — always quote it, and fall back to os.getcwd() inside the scripts.
9. Merge into .claude/settings.json with Python json load/dump. Do not hand-edit it and
   do not clobber existing PreToolUse entries (graphify's hooks live there). Match on the
   exact tool names above — a matcher naming a tool this version doesn't expose never fires.
10. Never log file CONTENT — only paths, counts and truncated commands. Skip .env*,
    *.pem, *.key, id_rsa, anything under secrets/. The journal gets committed.
11. Deletes and renames happen through Bash (rm/mv), not through a file tool, so they are
    captured by the Bash branch of the logger. Read-only commands (ls/cat/grep/git status)
    are filtered out or the log becomes noise.
12. Hooks load at startup only. After install I must RESTART Claude Code once and approve
    them when prompted, or nothing fires.

STEPS

1) Create the directory and the journal skeleton:

   mkdir -p .claude/journal/archive

   ----- JOURNAL.md (project root) -----
   # Process Journal

   Append-only record of what changed in this project and why. The log below is written
   automatically by Claude Code hooks. Humans and future sessions read the "Now" block first.

   <!-- journal:pinned:start -->
   ## Now
   - **Working on:** (nothing yet — first session)
   - **Next up:** —
   - **Blocked / open questions:** —
   - **Tried and rejected:** —
   <!-- journal:pinned:end -->

   ---

   ## Log
   ----- end -----

   The two pinned markers are load-bearing: session_start.py and wrap_session.py locate
   the "Now" block by them. Do not remove or reword them.

2) Create .claude/journal/log_event.py with EXACTLY this content:

   ----- .claude/journal/log_event.py -----
   #!/usr/bin/env python3
   """PostToolUse -> append one bullet to JOURNAL.md. Fast, silent, never fails."""
   import json, os, sys, difflib
   from datetime import datetime
   from pathlib import Path

   ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
   JOURNAL = ROOT / "JOURNAL.md"
   STATE = ROOT / ".claude" / "journal"
   MAX_BYTES = 500_000
   SKIP_PATH = ("JOURNAL.md", ".claude/journal", ".git/", "node_modules/",
                "graphify-out/", ".env", "secrets/", ".pem", ".key", "id_rsa")
   SKIP_CMD = ("ls", "cat", "head", "tail", "grep", "rg", "find", "fd", "which", "pwd",
               "echo", "wc", "tree", "jq", "sed -n", "git status", "git diff", "git log",
               "git show", "git branch --list", "python3 .claude/journal")

   TEMPLATE = ("# Process Journal\n\n<!-- journal:pinned:start -->\n## Now\n"
               "- **Working on:** —\n- **Next up:** —\n- **Blocked / open questions:** —\n"
               "- **Tried and rejected:** —\n<!-- journal:pinned:end -->\n\n---\n\n## Log\n")

   def rel(p):
       try:
           return str(Path(p).resolve().relative_to(ROOT.resolve()))
       except Exception:
           return str(p)

   def skipped(p):
       return any(s in p for s in SKIP_PATH)

   def delta(old, new):
       a, b = old.splitlines(), new.splitlines()
       if len(a) + len(b) > 6000:
           return max(0, len(b) - len(a)), max(0, len(a) - len(b))
       add = rem = 0
       for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
           if tag in ("replace", "delete"): rem += i2 - i1
           if tag in ("replace", "insert"): add += j2 - j1
       return add, rem

   def rollover(text):
       if len(text.encode("utf-8")) < MAX_BYTES or "## Log" not in text:
           return text
       head, log = text.split("## Log", 1)
       arch = STATE / "archive" / f"JOURNAL-{datetime.now():%Y-%m}.md"
       arch.parent.mkdir(parents=True, exist_ok=True)
       with open(arch, "a", encoding="utf-8") as fh:
           fh.write(log)
       return head + "## Log\n\n_Earlier entries archived to " + rel(arch) + "._\n"

   def append(chunk):
       if not JOURNAL.exists():
           JOURNAL.write_text(TEMPLATE, encoding="utf-8")
       cur = JOURNAL.read_text(encoding="utf-8", errors="replace")
       rolled = rollover(cur)
       if rolled != cur:
           JOURNAL.write_text(rolled, encoding="utf-8")
       with open(JOURNAL, "a", encoding="utf-8") as fh:
           try:
               import fcntl; fcntl.flock(fh, fcntl.LOCK_EX)
           except Exception:
               pass
           turn = STATE / ".turn"
           if turn.exists():
               fh.write(turn.read_text(encoding="utf-8"))
               try: turn.unlink()
               except Exception: pass
           fh.write(chunk)

   def main():
       d = json.load(sys.stdin)
       tool = d.get("tool_name", "")
       ti = d.get("tool_input") or {}
       ts = datetime.now().strftime("%H:%M")
       line = None

       if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
           path = rel(ti.get("file_path") or ti.get("notebook_path") or "?")
           if skipped(path):
               return
           if tool == "Write":
               n = (ti.get("content") or "").count("\n") + 1
               line = f"- `{ts}` wrote `{path}` (~{n} lines)"
           elif tool == "Edit":
               a, r = delta(ti.get("old_string") or "", ti.get("new_string") or "")
               line = f"- `{ts}` edited `{path}` +{a}/-{r}"
           elif tool == "MultiEdit":
               edits = ti.get("edits") or []
               a = r = 0
               for e in edits:
                   x, y = delta(e.get("old_string") or "", e.get("new_string") or "")
                   a += x; r += y
               line = f"- `{ts}` edited `{path}` +{a}/-{r} ({len(edits)} edits)"
           else:
               line = f"- `{ts}` edited notebook `{path}`"

       elif tool == "Bash":
           cmd = " ".join((ti.get("command") or "").split())
           low = cmd.lower()
           if not cmd or any(low.startswith(p) for p in SKIP_CMD):
               return
           short = cmd if len(cmd) <= 120 else cmd[:117] + "..."
           verb = "removed" if low.startswith(("rm ", "rm -")) else \
                  "moved" if low.startswith(("mv ", "git mv")) else "ran"
           line = f"- `{ts}` {verb} `{short}`"

       if line:
           append(line + "\n")

   try:
       main()
   except Exception:
       pass
   sys.exit(0)
   ----- end -----

3) Create .claude/journal/capture_intent.py with EXACTLY this content. It records the
   "why" for the coming turn and stages the session/turn headings, which log_event.py
   flushes on the first actual change (so pure-question turns leave no empty headings):

   ----- .claude/journal/capture_intent.py -----
   #!/usr/bin/env python3
   """UserPromptSubmit -> stage the turn heading + the reason. PRINTS NOTHING."""
   import json, os, sys
   from datetime import datetime
   from pathlib import Path

   try:
       ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
       STATE = ROOT / ".claude" / "journal"
       STATE.mkdir(parents=True, exist_ok=True)
       d = json.load(sys.stdin)
       prompt = " ".join((d.get("prompt") or "").split())
       sid = (d.get("session_id") or "nosession")[:8]
       why = (prompt[:200] + ("..." if len(prompt) > 200 else "")) or "(no prompt text)"
       pending = ""
       cur = STATE / ".session"
       if not cur.exists() or cur.read_text(encoding="utf-8").strip() != sid:
           cur.write_text(sid, encoding="utf-8")
           pending += f"\n### {datetime.now():%Y-%m-%d %H:%M} - session `{sid}`\n"
       pending += f"\n**Why:** {why}\n\n"
       (STATE / ".turn").write_text(pending, encoding="utf-8")
   except Exception:
       pass
   sys.exit(0)
   ----- end -----

4) Create .claude/journal/session_start.py with EXACTLY this content. This is what makes
   a new session resume instead of restart:

   ----- .claude/journal/session_start.py -----
   #!/usr/bin/env python3
   """SessionStart -> inject the Now block + recent log as context. One JSON line out."""
   import json, os, sys
   from pathlib import Path

   TAIL = 60
   try:
       ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
       J = ROOT / "JOURNAL.md"
       if not J.exists():
           sys.exit(0)
       text = J.read_text(encoding="utf-8", errors="replace")
       pinned = ""
       if "<!-- journal:pinned:start -->" in text and "<!-- journal:pinned:end -->" in text:
           pinned = text.split("<!-- journal:pinned:start -->", 1)[1] \
                        .split("<!-- journal:pinned:end -->", 1)[0].strip()
       tail = "\n".join(text.splitlines()[-TAIL:])
       ctx = ("PROCESS JOURNAL (./JOURNAL.md) - carried over from earlier sessions. "
              "Treat it as the record of what was already done and why; do not redo "
              "work listed here, and check 'Tried and rejected' before proposing an approach.\n\n"
              "=== Now ===\n" + (pinned or "(empty)") +
              "\n\n=== Last " + str(TAIL) + " lines of the log ===\n" + tail +
              "\n\nThe log is appended automatically by hooks - never hand-edit it. "
              "When you finish a task or change direction, update ONLY the block between "
              "the journal:pinned markers.")
       print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart",
                                                "additionalContext": ctx}}))
   except Exception:
       pass
   sys.exit(0)
   ----- end -----

5) Create .claude/journal/wrap_session.py with EXACTLY this content (Stop + PreCompact:
   one-line recap and a refreshed "Now" block; silently no-ops when the `claude` CLI is
   unavailable). Note the two recursion guards from gotcha 7:

   ----- .claude/journal/wrap_session.py -----
   #!/usr/bin/env python3
   """Stop/PreCompact -> recap the turn and refresh the Now block. Silent, best-effort."""
   import json, os, sys, time, shutil, subprocess
   from pathlib import Path

   DEBOUNCE = 60
   START, END = "<!-- journal:pinned:start -->", "<!-- journal:pinned:end -->"

   def main():
       if os.environ.get("JOURNAL_NO_SUMMARY"):           # guard A: nested claude
           return
       d = json.load(sys.stdin)
       if d.get("stop_hook_active"):                      # guard B: our own re-entry
           return
       ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
       J = ROOT / "JOURNAL.md"
       STATE = ROOT / ".claude" / "journal"
       if not J.exists() or not shutil.which("claude"):
           return
       stamp = STATE / ".recap.stamp"
       now = int(time.time())
       if stamp.exists():
           try:
               if now - int(stamp.read_text().strip()) < DEBOUNCE:
                   return
           except Exception:
               pass
       text = J.read_text(encoding="utf-8", errors="replace")
       if "**Why:**" not in text:
           return
       block = "**Why:**" + text.rsplit("**Why:**", 1)[1]
       if "\n- `" not in block or "**Recap:**" in block:   # nothing happened / already done
           return
       stamp.write_text(str(now))
       pinned = text.split(START, 1)[1].split(END, 1)[0].strip() if START in text else ""
       ask = ("Below is the current 'Now' block of a project journal and the raw event log "
              "of the turn that just ended. Reply with ONLY a JSON object, no prose, no "
              "markdown fences: {\"recap\": \"<one sentence, past tense, what was "
              "accomplished>\", \"now\": \"<the four Now bullets, updated, markdown, keeping "
              "the exact labels Working on / Next up / Blocked / Tried and rejected>\"}\n\n"
              "=== Now ===\n" + pinned + "\n\n=== Turn ===\n" + block[-4000:])
       env = dict(os.environ, JOURNAL_NO_SUMMARY="1")
       try:
           p = subprocess.run(["claude", "-p", ask], capture_output=True, text=True,
                              timeout=120, env=env, cwd=str(ROOT), stdin=subprocess.DEVNULL)
       except Exception:
           return
       raw = (p.stdout or "").strip().strip("`")
       if raw.startswith("json"):
           raw = raw[4:]
       if "{" not in raw:
           return
       try:
           got = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
       except Exception:
           return
       text = J.read_text(encoding="utf-8", errors="replace")
       if got.get("now") and START in text and END in text:
           head, rest = text.split(START, 1)
           _, tail = rest.split(END, 1)
           text = head + START + "\n## Now\n" + got["now"].strip() + "\n" + END + tail
       if got.get("recap"):
           text = text.rstrip("\n") + "\n- **Recap:** " + " ".join(got["recap"].split()) + "\n"
       with open(J, "w", encoding="utf-8") as fh:
           try:
               import fcntl; fcntl.flock(fh, fcntl.LOCK_EX)
           except Exception:
               pass
           fh.write(text)

   try:
       main()
   except Exception:
       pass
   sys.exit(0)
   ----- end -----

   If I have no `claude` CLI or don't want the extra LLM call per turn, skip registering
   Stop/PreCompact in Step 6 — the journal still works, and you (Claude) update the Now
   block yourself per the CLAUDE.md rule in Step 7.

6) Register the hooks by MERGING into .claude/settings.json. Run this from the project
   root; do not hand-edit the file:

   ----- install_journal_hooks.py (scratch, delete after) -----
   import json
   from pathlib import Path
   p = Path(".claude/settings.json"); p.parent.mkdir(parents=True, exist_ok=True)
   raw = p.read_text(encoding="utf-8").strip() if p.exists() else ""
   cfg = json.loads(raw) if raw else {}
   hooks = cfg.setdefault("hooks", {})
   D = "$CLAUDE_PROJECT_DIR/.claude/journal"
   want = [
       ("PostToolUse",      "Write|Edit|MultiEdit|NotebookEdit|Bash", f'python3 "{D}/log_event.py"'),
       ("UserPromptSubmit", None,                                     f'python3 "{D}/capture_intent.py"'),
       ("SessionStart",     "startup|resume|clear",                   f'python3 "{D}/session_start.py"'),
       ("Stop",             None,                                     f'python3 "{D}/wrap_session.py"'),
       ("PreCompact",       None,                                     f'python3 "{D}/wrap_session.py"'),
   ]
   for event, matcher, cmd in want:
       arr = hooks.setdefault(event, [])
       if any(cmd in json.dumps(e) for e in arr):
           continue
       entry = {"hooks": [{"type": "command", "command": cmd, "timeout": 20}]}
       if matcher:
           entry["matcher"] = matcher
       arr.append(entry)
   p.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
   print(json.dumps(cfg, indent=2))
   ----- end -----

   Run: python3 install_journal_hooks.py && rm install_journal_hooks.py
   Existing PreToolUse / PostToolUse entries (e.g. graphify's auto-refresh) must survive
   untouched — confirm by reading the printed JSON.

7) Append this block to ./CLAUDE.md (create it if absent; if graphify already wrote one,
   append, do not overwrite). Keep the marker comments so it can be updated idempotently:

   ----- append to CLAUDE.md -----
   <!-- journal:rules:start -->
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
   ----- end -----

8) Smoke-test BEFORE restarting, by feeding the scripts fake payloads:

   echo '{"tool_name":"Edit","tool_input":{"file_path":"README.md","old_string":"a\nb","new_string":"a\nb\nc"}}' | python3 .claude/journal/log_event.py
   echo '{"prompt":"test intent","session_id":"deadbeef1234"}' | python3 .claude/journal/capture_intent.py
   echo '{"source":"startup"}' | python3 .claude/journal/session_start.py

   Expect: capture_intent prints NOTHING; session_start prints exactly one line of valid
   JSON; log_event prints nothing and JOURNAL.md gained a `+1/-0` bullet. All three exit 0.
   Then remove the test bullet from JOURNAL.md by hand (this is the only sanctioned manual
   edit of the log) and delete .claude/journal/.turn if it lingers.

9) Verify and report:
   - .claude/settings.json is valid JSON, contains the five new entries, and still has any
     pre-existing PreToolUse/PostToolUse hooks.
   - JOURNAL.md exists at the root with both pinned markers intact.
   - .claude/journal/ contains log_event.py, capture_intent.py, session_start.py,
     wrap_session.py, and archive/.
   - All three smoke tests behaved as described above.
   - Tell me to RESTART Claude Code once so the hooks load, and to approve them when
     prompted. Also tell me to commit JOURNAL.md, .claude/journal/, CLAUDE.md and
     .claude/settings.json, and add .claude/journal/.turn, .session, .recap.stamp to
     .gitignore (transient state, not history).

Notes for me afterward: the log is written only for tool calls YOU make — if I edit files
outside Claude, those changes are invisible to the journal, so I mention them in a prompt
and they land under that turn's **Why:**. Deletes/renames show up as `rm`/`mv` entries.
The recap costs one extra Claude call per turn (debounced 60s) and is skipped entirely if
the turn changed nothing. JOURNAL.md self-archives past ~500KB into
.claude/journal/archive/JOURNAL-YYYY-MM.md, keeping the root file readable forever.
```
