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
