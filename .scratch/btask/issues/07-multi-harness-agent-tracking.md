# 07: Multi-harness, multi-agent tracking

**What to build:** A robust way for agents across different coding harnesses (opencode, Claude Code, others) and multiple concurrent agents to track work in btask automatically, without relying on each agent remembering the AGENTS.md discipline.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] Survey harness extension points (opencode plugin `session.created`/`session.idle` events confirmed present in `@opencode-ai/plugin`; equivalents in other harnesses unknown)
- [ ] Decide where cross-project state lives (per-repo `.btask/` vs a shared user-level DB) and how concurrent agents avoid clobbering each other
- [ ] Record the decision (ADR or spec note) and define the first vertical slice to implement it

## Comments

Seeded from conversation: AGENTS.md discipline works but depends on agent compliance. Open questions: per-harness plugins vs one shared daemon/hook protocol, agent identity on tasks, reminder/heartbeat path for long sessions.
