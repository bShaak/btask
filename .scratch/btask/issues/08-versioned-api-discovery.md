# 08: Versioned API + discovery

**What to build:** Any harness can find the btask daemon and handshake with it: versioned routes, a health endpoint, and a documented discovery chain, so clients never hardcode ports.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Routes move to `/api/v1`-only with identical semantics (no aliases — no clients yet); `GET /health` returns the server version
- [ ] Daemon writes its URL to a port file on startup and removes it on shutdown
- [ ] Discovery order documented and honored: `BTASK_URL` env, else port file, else default `127.0.0.1:3000`
- [ ] Default DB flips to the shared `~/.btask/btask.db`; `BTASK_DB` remains as the per-repo escape hatch
- [ ] Optional project label on tasks (auto-detected from git root at creation, overridable); `list` gains a `--project` filter and the API a `project` query param; null means global
