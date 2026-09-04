# 06: HTTP + WS adapters

**What to build:** The same task operations exposed over HTTP plus live change events over WebSocket, reusing the established service seam so future web, desktop, and mobile frontends can experiment without touching CLI or TUI logic.

**Blocked by:** 01: Core goals + subtasks via CLI, 02: Full CRUD + agent context, 03: Complete + summary artifact.

**Status:** ready-for-agent

- [ ] HTTP endpoints cover list, create, get, update, status, complete, context, and habits query with the same semantics as the CLI
- [ ] WebSocket emits task-change events so live frontends stay in sync
- [ ] CLI and TUI behavior unchanged; no business logic duplicated in transport adapters
