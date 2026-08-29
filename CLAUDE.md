## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

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
