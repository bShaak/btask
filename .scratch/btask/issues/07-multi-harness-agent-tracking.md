# 07: Multi-harness, multi-agent tracking (decision record)

**What to build:** A robust way for agents across different coding harnesses (opencode, Claude Code, others) and multiple concurrent agents to track work in btask automatically, without relying on each agent remembering the AGENTS.md discipline.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Survey harness extension points (opencode plugin `session.created`/`session.idle` events confirmed present in `@opencode-ai/plugin`; equivalents in other harnesses unknown)
- [ ] Decide where cross-project state lives (per-repo `.btask/` vs a shared user-level DB) and how concurrent agents avoid clobbering each other
- [ ] Record the decision (ADR or spec note) and define the first vertical slice to implement it

## Decision

Harness-agnostic HTTP API instead of per-harness plugins:

- Shared user-level DB (`~/.btask/btask.db` default; `BTASK_DB` escapes to per-repo isolation). One global goal list across repos; starts empty.
- Single-writer daemon: the HTTP server serializes concurrent writes and broadcasts WS events; it is the canonical agent path. Loopback-only, no auth; host configurable.
- Discovery: `BTASK_URL` env, else a port file, else default `127.0.0.1:3000`; `GET /health` returns the version for handshakes.
- API break to `/api/v1`-only (no clients yet, no aliases).
- Free-form actor strings (`harness:detail` by convention), stored on writes, surfaced in reads and WS events.
- Optional project label on tasks (auto-detected from git root, `list --project` filter); null means global.
- CLI delegates to the daemon when reachable, direct DB as fallback; agent UX unchanged.
- Habit agents push completions to btask; the habitui pull stays as fallback.

Slices: 08 (versioned API + discovery + shared default + project label), 09 (CLI delegation), 10 (actors), 11 (habit push).

## Comments

Seeded from conversation: AGENTS.md discipline works but depends on agent compliance. Open questions: per-harness plugins vs one shared daemon/hook protocol, agent identity on tasks, reminder/heartbeat path for long sessions.
