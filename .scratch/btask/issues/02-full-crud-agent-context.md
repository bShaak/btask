# 02: Full CRUD + agent context

**What to build:** Complete task management plus a single agent context read: fetch one task, update title/notes, delete, and dump the full hierarchy with parent links so agents can assign work to the right parent.

**Blocked by:** 01: Core goals + subtasks via CLI.

**Status:** ready-for-agent

- [ ] Get, update title/notes, and delete work through CLI and reflect in subsequent hierarchy reads
- [ ] Dedicated context command returns full hierarchy (ids, titles, status, parent links) in one JSON call
- [ ] Human-readable output flag works for list/get/context paths
