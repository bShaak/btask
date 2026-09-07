# 04: Habit pull query

**What to build:** Habits live as ordinary tasks with a habit marker, plus a pull query agents poll to remind the user about incomplete routines like exercising, stretching, and reading.

**Blocked by:** 01: Core goals + subtasks via CLI.

**Status:** ready-for-agent

- [ ] Habit marker can be set at creation and toggled on existing tasks through the same CRUD operations
- [ ] Pull query lists only incomplete habit-marked tasks for the external habit tracker to consume
- [ ] Habit tasks otherwise behave like normal tasks (hierarchy, status, completion)

## Comments

Follow-up decision: `habits` now delegates to habitui (system of record) via `habitui cli list --json`, filtered to due-and-incomplete; `HABITUI_BIN` selects the binary, `HABITUI_DB` passes through to it, `--local` keeps the flag-based query. Local markers retained for linking.
