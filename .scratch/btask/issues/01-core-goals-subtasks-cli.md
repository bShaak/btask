# 01: Core goals + subtasks via CLI

**What to build:** Day goals pinned at top with indented sub-tasks end-to-end: create goals and sub-tasks, list hierarchy, and move status through todo → in progress → finished, all through the agent-facing CLI with JSON by default.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Create top-level goal and sub-task under a parent, list shows goals pinned top with subs indented in creation order
- [ ] Status transitions todo → in progress → finished work through CLI and persist across runs via local SQLite store
- [ ] CLI outputs JSON by default with a human-readable flag; service-seam tests cover hierarchy and status lifecycle
