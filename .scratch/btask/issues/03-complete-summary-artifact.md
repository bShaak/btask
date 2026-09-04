# 03: Complete + summary artifact

**What to build:** Finishing a parent goal writes a human-reviewable markdown summary artifact and wipes its sub-tasks from the active view, even if some sub-tasks are still open.

**Blocked by:** 01: Core goals + subtasks via CLI.

**Status:** ready-for-agent

- [ ] Complete command accepts an optional agent-provided summary string alongside the auto-generated sub-task list
- [ ] Artifact is written per completed goal with frontmatter (goal id, title, completed-at) plus work performed
- [ ] After completion, sub-tasks no longer appear in the active hierarchy but the artifact persists for later review
