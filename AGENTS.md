# AGENTS.md

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped 1:1 (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

## btask tracking

Track multi-step work in btask so progress survives across threads. The CLI is the agent contract: JSON by default, `--human` to show the user.

- Session start: run `context` to see active goals and `list` for the hierarchy. State lives in `BTASK_DB` (default `~/.btask/btask.db`, shared across repos).
- Larger goal (a spec, a ticket batch): `create` a goal first, or attach to a matching open goal instead of duplicating it.
- One sub-task per unit of work (`create --parent <goal-id>`) — create it *before* starting the work, never after. Set it `in_progress` when starting and `finished` when done. Never leave a task `in_progress` at session end.
- Finishing a goal (`complete --summary`) writes the review artifact and wipes its sub-tasks — pass a real summary of what was done.
