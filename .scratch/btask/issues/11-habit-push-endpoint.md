# 11: Habit push endpoint

**What to build:** Habit agents push completions into btask instead of btask polling habitui, so an open TUI updates the moment a habit is completed elsewhere.

**Blocked by:** 08: Versioned API + discovery, 10: Actor attribution.

**Status:** ready-for-agent

- [ ] Push endpoint records a habit completion with actor identity and emits a WebSocket event carrying it
- [ ] Habitui pull (`habits` command) stays as the fallback when no push arrives
- [ ] End-to-end flow documented for the habit agent (push on completion, poll on startup)
