# 09: CLI delegates to daemon

**What to build:** The CLI forwards writes to the running daemon when reachable and falls back to direct DB access otherwise, with identical JSON output either way — agent UX never changes.

**Blocked by:** 08: Versioned API + discovery.

**Status:** ready-for-agent

- [ ] CLI resolves the daemon URL via the discovery chain and forwards mutating commands over HTTP
- [ ] Output shapes are byte-identical between daemon and direct paths
- [ ] Daemon unreachable → transparent direct-DB fallback (reads always work offline)
