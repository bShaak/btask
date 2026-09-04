Status: ready-for-agent

# btask — Task Tracking / Todo System Spec

## Problem Statement

I juggle work, chores, and habits (exercising, stretching, reading) and I mostly work through agents. I have no single place where my day's goals stay visible at the top, agents can claim and advance sub-tasks with live animated status, completed work gets crossed off, and finished goals collapse into a reviewable summary. Ad-hoc markdown todos and chat transcripts lose hierarchy, status, and history.

## Solution

A `btask` system with deep library modules behind a small service interface, one API layer on top, and thin adapters for CLI, HTTP, WebSocket, and a TUI (first frontend; native desktop/mobile/web later). Day goals stay pinned at the top of the hierarchy with indented sub-tasks. Sub-task status animates while an agent works (Claude Code style), completed sub-tasks strike through, and completing a parent wipes its sub-tasks from the UI while persisting a work-summary artifact for later review. Agents drive everything through the CLI (and later HTTP/WS) with full task context including parent assignment.

## User Stories

1. As a user, I want to create a day goal, so that my priorities stay pinned at the top of the hierarchy.
2. As a user, I want to list my goals and sub-tasks hierarchically, so that I see structure at a glance.
3. As a user, I want to update a task title and notes, so that I can clarify work as it evolves.
4. As a user, I want to delete a task, so that I can remove mistakes or stale items.
5. As a user, I want to set task status to todo, in progress, or finished, so that progress is explicit.
6. As an agent, I want to fetch current task context, so that I know what goals and sub-tasks exist before acting.
7. As an agent, I want to create a sub-task under a parent goal, so that I can decompose work I am doing.
8. As an agent, I want to assign my work to a parent task, so that my activity is attributable to the right goal.
9. As an agent, I want to mark my sub-task in progress, so that the UI animates it as active.
10. As an agent, I want to check off a todo, so that the user's list advances without manual input.
11. As an agent, I want to update a sub-task status, so that handoffs between agents stay coherent.
12. As a user, I want completed sub-tasks crossed off but still visible, so that I see what got done today.
13. As a user, I want completing a parent goal to wipe its sub-tasks from the UI, so that finished work stops cluttering the view.
14. As a user, I want a work-summary artifact written on parent completion, so that I can review what was done later.
15. As a user, I want to see animated in-progress indicators on active sub-tasks, so that I know agents are working.
16. As a user, I want habit tasks (exercise, stretch, read), so that routines live alongside work and chores.
17. As an agent, I want to remind the user about incomplete habits, so that routines are not forgotten.
18. As a user, I want CRUD on habits through the same task operations, so that I learn one workflow.
19. As a user, I want to run a TUI to view and edit tasks, so that I have a UI while the system is being built.
20. As an agent, I want a CLI to list, create, update status, and complete tasks, so that I never need the TUI.
21. As an experimenter, I want HTTP access to the same operations, so that I can try web frontends later.
22. As an experimenter, I want WebSocket events for task changes, so that live frontends (TUI/web/mobile) stay in sync.
23. As a maintainer, I want library logic in deep modules behind well-tested seams, so that CLI/server/TUI stay thin.

## Implementation Decisions

- Deep modules with small interfaces: one Task Hierarchy module owns parent/child structure, ordering (day goals pinned top, sub-tasks indented), and status transitions (todo → in progress → finished); one Completion Artifact module owns collapse-on-complete plus summary generation and storage.
- Single highest test seam: the Task Service interface (create/get/list hierarchy, update, move/indent, set status, complete-with-artifact, habit reminder query). All adapters (CLI, HTTP, WS, TUI) call through this seam; no business logic leaks into adapters.
- No new seams beyond the service seam for v1; storage, clock, and artifact-sink are internal seams private to the module implementations, swappable via in-memory fakes in tests.
- Status model is exactly todo, in progress, finished; completion of a parent triggers artifact write then sub-task wipe as one atomic behavior owned by the service, not the UI.
- Agent context is a read of the current hierarchy plus parent identifiers, so sub-task creation always carries a parent link.
- Habit reminders are a query over the same task model (habit-marked tasks incomplete for the day), not a separate subsystem.
- Adapter layering: library modules → API layer → CLI / HTTP server / WebSocket interface → TUI first; native desktop/mobile/web are future adapters reusing the same API seam.
- Runtime is Bun with TypeScript strict mode; persistence starts as local file-backed storage swappable behind the internal storage seam.

## Testing Decisions

- A good test exercises external behavior through the interface (e.g. complete parent → sub-tasks hidden + artifact stored with work performed) without asserting on internal storage layout, animation frames, or transport framing.
- Modules to test: Task Service seam (hierarchy, status lifecycle, completion collapse + artifact) as the primary suite; Completion Artifact summarization as focused unit coverage through its own interface. Adapters get thin contract tests only (CLI/HTTP/WS delegate to the service; TUI rendering verified manually in v1).
- Prior art: none — greenfield repo. Establish the pattern with Bun's test runner at the service seam; future tests follow the same seam-first convention.

## Out of Scope

- Native desktop, mobile, and web frontends beyond the TUI plus HTTP/WS hooks for experimentation.
- Multi-user accounts, auth, sharing, and cloud sync.
- Rich scheduling, recurrence rules beyond daily habits, notifications infrastructure, and calendar integration.
- Full-text search, tags taxonomy, priorities beyond day-goal pinning, and analytics dashboards.
- Migration tooling from external todo systems.

## Further Notes

- Start with TUI so there is a usable UI while building; CLI is the agent contract and must remain scriptable and stable.
- Animation (spinners on in-progress sub-tasks) and strikethrough are TUI presentation concerns driven by status events, not stored state.
- Artifacts should be human-reviewable (markdown summaries of work performed) and addressable per completed goal.

## Comments
