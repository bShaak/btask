# 12: Archive flag

**What to build:** Any task can be shelved out of the active view without completing it — for lost interest, and so habit sync can shelve prior days.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Nullable archived marker on tasks (same migration pattern); `archive <id>` sets it, `--off` clears it
- [ ] `list`, TUI, and API hierarchy hide archived tasks and archived goals' subtrees by default; `--archived`/`--all` (and query params) review them
- [ ] Completing an archived task is allowed and leaves the marker as-is
