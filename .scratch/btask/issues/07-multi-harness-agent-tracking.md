# 07: Multi-harness, multi-agent tracking (decision record)

**What to build:** A robust way for agents across different coding harnesses (opencode, Claude Code, others) and multiple concurrent agents to track work in btask automatically, without relying on each agent remembering the AGENTS.md discipline.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Survey harness extension points (opencode plugin `session.created`/`session.idle` events confirmed present in `@opencode-ai/plugin`; equivalents in other harnesses unknown)
- [ ] Decide where cross-project state lives (per-repo `.btask/` vs a shared user-level DB) and how concurrent agents avoid clobbering each other
- [ ] Record the decision (ADR or spec note) and define the first vertical slice to implement it

## Decision

Harness-agnostic HTTP API instead of per-harness plugins:

- Single-writer daemon: the HTTP server serializes concurrent writes and broadcasts WS events; it is the canonical agent path.
- Discovery: `BTASK_URL` env, else a port file, else default `127.0.0.1:3000`; `GET /health` returns the version for handshakes.
- CLI delegates to the daemon when reachable, direct DB as fallback; agent UX unchanged.
- Actor attribution on writes, surfaced in reads and WS events.
- Habit agents push completions to btask; the habitui pull stays as fallback.

Slices: 08 (versioned API + discovery), 09 (CLI delegation), 10 (actors), 11 (habit push).

## Comments

Seeded from conversation: AGENTS.md discipline works but depends on agent compliance. Open questions: per-harness plugins vs one shared daemon/hook protocol, agent identity on tasks, reminder/heartbeat path for long sessions.
