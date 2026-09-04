# 05: Live TUI

**What to build:** A live terminal UI showing day goals pinned at top with indented sub-tasks, animated in-progress indicators, strikethrough on finished items, wiped sub-tasks after parent completion, and minimal keyboard CRUD.

**Blocked by:** 01: Core goals + subtasks via CLI, 03: Complete + summary artifact.

**Status:** ready-for-agent

- [ ] Hierarchy renders with goals on top, subs indented; in-progress animates, finished shows crossed off, completed parents hide subs
- [ ] View refreshes on a short poll so agent CLI changes appear live without restart
- [ ] Minimal keys work: navigate, add sub-task, cycle status, complete a goal
