# 08: Versioned API + discovery

**What to build:** Any harness can find the btask daemon and handshake with it: versioned routes, a health endpoint, and a documented discovery chain, so clients never hardcode ports.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Existing routes available under an `/api/v1` prefix with identical semantics; `GET /health` returns the server version
- [ ] Daemon writes its URL to a port file on startup and removes it on shutdown
- [ ] Discovery order documented and honored: `BTASK_URL` env, else port file, else default `127.0.0.1:3000`
