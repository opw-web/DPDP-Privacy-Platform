#!/usr/bin/env python3
"""PostToolUse -> append one bullet to JOURNAL.md. Fast, silent, never fails."""
import json, os, re, sys, difflib
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

# Secrets must never reach the journal (it gets committed). SKIP_CMD is prefix-only,
# so a secret inside a compound command (cd x && echo pw | sudo -S ...) slips past it.
REDACT = [
    (re.compile(r"(echo\s+[\"']?)[^\"'|]*([\"']?\s*\|\s*sudo\s+-S)"), r"\1[REDACTED]\2"),
    (re.compile(r"(--(?:password|token|api[-_]?key|secret)[= ])\S+", re.I), r"\1[REDACTED]"),
    (re.compile(r"((?:PASSWORD|TOKEN|API_KEY|SECRET|ACCESS_KEY)[A-Z_]*=)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(Authorization:\s*Bearer\s+)\S+", re.I), r"\1[REDACTED]"),
]

def redact(cmd):
    for pat, sub in REDACT:
        cmd = pat.sub(sub, cmd)
    return cmd

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
        cmd = redact(cmd)
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
