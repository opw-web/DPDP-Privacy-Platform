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
