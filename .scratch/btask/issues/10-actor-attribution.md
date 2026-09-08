# 10: Actor attribution

**What to build:** Every write records which agent made it, so concurrent agents (coding harnesses, habit agents) can tell each other's work apart in reads and live events.

**Blocked by:** 08: Versioned API + discovery.

**Status:** ready-for-agent

- [ ] Writes accept an actor identity (CLI flag, HTTP header) stored with the task
- [ ] Actor is surfaced in reads (`get`, `context`, `list`) and in WebSocket change events
- [ ] Unset actor stays null — no behavior change for existing single-user flows
