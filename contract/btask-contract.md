# btask lifecycle contract

Track multi-step work in btask. Simple questions and greetings need no tasks.

1. Before multi-step work, run `btask context` and `btask list`. Reuse a matching open goal in the correct project, or create one with `btask create "<goal>"`. Preserve unrelated users' and sessions' work.
2. Create a subtask before each unit of work: `btask create "<task>" --parent <goal-id>`. Retain full returned goal and task IDs in session context, delegation prompts, and handoff summaries. Delegated agents reuse their assigned task rather than duplicating it.
3. Start work with `btask status <task-id> in_progress`. Update notes when scope changes or a blocker appears: `btask update <task-id> --notes "<current context and next step>"`. Preserve useful existing notes.
4. Verify the deliverable before `btask status <task-id> finished`. For code, run the applicable tests, lint, and typecheck discovered in the project; report unavailable or failing checks accurately. For other work, check the output against the agreed acceptance criteria. Record actual verification results in notes.
5. Before ending a turn, reconcile every task worked on. Leave completed tasks finished. For unfinished work, preserve recovery notes and set the task to `todo`; asking a question, cancellation, failed checks, or an idle session is not completion. On resuming interrupted work, inspect the assigned task and actual deliverables before changing status. Only reconcile tasks assigned to this session; another session may still be working.
6. Complete a goal only when all agreed work is verified and this session owns completion: `btask complete <goal-id> --summary "<deliverables, verification, and limitations>"`. This writes a review artifact and deletes subtasks. For a shared or delegated goal, finish only assigned subtasks and leave goal completion to its owner.

## CLI results and recovery

Use default JSON for automation; reserve `--human` for display. Check exit status, parse JSON, and retain returned IDs. If a mutation fails or its result is uncertain, inspect `btask get <id>` or `btask list --all` before retrying. For creations, use a stable `--external-id` when a runner supplies a work identifier, then reconcile that identifier in the hierarchy. External IDs alone do not guarantee atomic deduplication; never blindly repeat a creation. If btask is unavailable, report the tracking failure and preserve IDs and next steps for recovery rather than claiming tracking succeeded.

These instructions guide agent behavior; they are not a runner-enforced completion gate.
