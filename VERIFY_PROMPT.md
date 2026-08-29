# Paste into a FRESH Claude Code session in this project root, after restarting.

```
Run a setup self-check for this project and report back in one compact block I can
copy-paste elsewhere. Do NOT fix anything — only observe and report. Steps:

1. SESSION CONTEXT: Before doing anything else, tell me whether a "PROCESS JOURNAL"
   block was injected into your context at session start (it comes from
   .claude/journal/session_start.py). Quote the "Working on:" line you were given.
   If you got no such block, say "SessionStart hook did NOT fire".

2. PLUGINS / MCP: List which of these you can actually see right now:
   - chrome-devtools MCP tools (names starting with mcp__chrome-devtools__ or similar)
   - superpowers skills (brainstorming, test-driven-development, systematic-debugging, ...)
   Report the count of chrome-devtools MCP tools you have available, and 3 superpowers
   skill names. If either is absent, say so plainly.

3. GRAPHIFY PRETOOLUSE HOOK: Run a Bash command containing `grep` (e.g.
   `grep -c DPDP DPDP_COMPLIANCE_CHECKLIST.md`). Report whether you received a
   "MANDATORY: graphify-out/graph.json exists" reminder from the hook. Then run
   `graphify query "consent"` and report the node count it prints.

4. JOURNAL WRITE PATH: Create a throwaway file `_hookcheck.txt` with 2 lines, then edit
   it to add 1 line, then `rm _hookcheck.txt`. Now show me the last 12 lines of
   JOURNAL.md. I expect to see: a `### <date> - session` heading, a `**Why:**` line
   quoting THIS prompt, a `wrote _hookcheck.txt` bullet, an `edited` bullet, and a
   `removed rm _hookcheck.txt` bullet. Report which of those five appeared.

5. OBSIDIAN VAULT: Confirm graphify-out/obsidian/ exists, print how many .md notes it
   contains, and list the community note filenames.

6. Report the output of: `graphify --version 2>/dev/null || which graphify`, `node --version`,
   `git --version`, and whether `.venv` exists in the project root (it should NOT).

FINALLY: print a single fenced block titled SETUP CHECK with one line per item:
   journal-sessionstart, journal-userpromptsubmit, journal-posttooluse, graphify-pretooluse,
   graphify-query, chrome-devtools-mcp, superpowers, obsidian-vault, tooling
each marked PASS or FAIL with a 5-word note. Nothing else in that block.
```
