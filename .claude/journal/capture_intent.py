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
