# btask

## Setup

Requires Bun and, for the agent integration, OpenCode.

### Install a live CLI for your user

From this checkout, install dependencies:

```sh
bun install
mkdir -p "$HOME/.local/bin"
command -v bun
pwd
```

Create `~/.local/bin/btask` with the following contents, replacing both paths with the absolute paths reported above:

```sh
#!/bin/sh
exec /absolute/path/to/bun run /absolute/path/to/btask/src/cli.ts "$@"
```

Make it executable:

```sh
chmod +x "$HOME/.local/bin/btask"
```

For zsh, add this to `~/.zshenv` so interactive and noninteractive shells can discover it:

```sh
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
```

The wrapper runs the current checkout, including uncommitted changes, without reinstalling. Keep the checkout and Bun at these paths. Broken edits can break the installed CLI; running processes must restart to pick up changes. This is a user-local installation, not an all-users installation.

By default, tasks live in `~/.btask/btask.db`, shared across repositories for your user. `BTASK_DB` overrides that location; `BTASK_ARTIFACTS` overrides the default review directory, `~/.btask/artifacts`.

### Load the shared lifecycle contract in OpenCode

Create `~/.agents/btask-contract.md` (create `~/.agents` first if needed) with these instructions:

```markdown
# btask lifecycle contract

Track multi-step work in btask; simple questions and greetings need no tasks.

1. Before work, run `btask context` and `btask list`. Reuse a matching open goal in the correct project, or create one with `btask create "<goal>"`.
2. Before each unit of work, run `btask create "<task>" --parent <goal-id>`. Retain full returned IDs in session context, delegation prompts, and handoffs. Delegates reuse assigned tasks.
3. Start with `btask status <task-id> in_progress`. Record scope changes, blockers, and next steps using `btask update <task-id> --notes "<context>"`, preserving useful existing notes.
4. Verify before `btask status <task-id> finished`. For code, run applicable tests, lint, and typecheck; for other work, check agreed acceptance criteria. Record actual results and unavailable or failing checks.
5. Before ending a turn, leave completed tasks finished; preserve recovery notes and set unfinished tasks to `todo`. Questions, cancellation, failed checks, and idle sessions are not completion. On resuming, inspect assigned tasks and actual deliverables. Only reconcile this session's tasks, not another session's active work.
6. Only the goal's completion owner runs `btask complete <goal-id> --summary "<deliverables, verification, limitations>"`, after all agreed work is verified. This writes a review artifact and deletes subtasks. Delegates finish only assigned subtasks.

Use default JSON for automation and `--human` for display. Check exit status, parse JSON, and retain IDs. After uncertain mutations, reconcile with `btask get <id>` or `btask list --all` before retrying. Use a stable `--external-id` when a runner supplies one, but do not assume it guarantees atomic deduplication. Report tracking failures and preserve recovery context instead of claiming success.

These instructions guide behavior; they are not a runner-enforced completion gate.
```

Add the file to `~/.config/opencode/opencode.jsonc`, using your actual absolute home path. Merge into existing settings and preserve any other instruction entries:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["/home/YOUR_USER/.agents/btask-contract.md"]
}
```

This loads the contract globally across OpenCode projects. Quit and restart OpenCode after changing the configuration. Agents launched outside zsh must inherit a PATH containing `~/.local/bin` or use the wrapper's absolute path.

### Load the shared contract in other harnesses

`~/.agents/btask-contract.md` is harness-neutral (plain markdown, btask CLI commands only). Each harness just needs to load that one file:

**Codex** — append the contract to your global instructions (Codex concatenates `AGENTS.md` files and has no import syntax, so the content must be inline):

```sh
mkdir -p ~/.codex
cat ~/.agents/btask-contract.md >> ~/.codex/AGENTS.md
```

Restart Codex afterwards (the instruction chain builds once per session). Re-append whenever the contract changes. Verify by asking a session to summarize its loaded instructions, or inspect the rollout under `~/.codex/sessions`. Keep the global file small: all `AGENTS.md` files share a 32 KiB cap (`project_doc_max_bytes`), and a bloated global file starves repo files. This repo's own `AGENTS.md` is picked up automatically as project scope when working here.

**Claude Code** — import the contract from user-scope memory (imports in `~/.claude/CLAUDE.md` load without an approval dialog):

```md
@~/.agents/btask-contract.md
```

Append that line to `~/.claude/CLAUDE.md` (create it if needed). This stays single-sourced: contract edits apply to the next session with no re-sync step. Verify with `/context` (Memory files) or `/memory` in a fresh session. A project-level `CLAUDE.md` import works too but triggers a one-time approval dialog since the path sits outside the working directory.

**Cursor** — add a global user rule (Cursor Settings → Rules) that points at the contract, set to Always Apply; or place an `.mdc` file with `alwaysApply: true` under `~/.cursor/rules/`. Either way the rule body should instruct the agent to read and follow `~/.agents/btask-contract.md` each session. Verify in Settings → Rules that the rule is classified Always. Note Cursor also reads this repo's `AGENTS.md` natively when working here — that covers repo conventions, while the global rule covers cross-repo lifecycle tracking.

Same `PATH` caveat as OpenCode for every harness: agents launched outside zsh must inherit a `PATH` containing `~/.local/bin` (or set `BTASK_DB` explicitly) so the `btask` CLI resolves.

### Verify

```sh
zsh -lc 'command -v btask && btask list --human'
zsh -c 'command -v btask'
opencode debug config
```

Confirm the wrapper resolves and the resolved OpenCode configuration includes the contract path. In a fresh OpenCode session, ask it to identify the loaded contract and its interruption rule without calling tools or changing files.

This setup installs the live CLI and shared instructions only. Instruction loading does not prove lifecycle compliance.

### Enforce completion with supervised runs

No OpenCode plugin hook can veto turn completion: `session.idle` and `event` hooks are observers, throwing in `tool.execute.before` fails only that one tool call, and `experimental.text.complete` only rewrites generated text. So enforcement lives outside the model in `scripts/btask-run.sh`: it runs `opencode run`, holds the result, and only exits 0 if the tracked task is actually `finished` (plus an optional verification command).

```sh
./scripts/btask-run.sh --task <task-id> --verify "bun test && bun run typecheck" -- "Finish the sub-task and mark it finished"
OPENCODE_ARGS="--model anthropic/claude-sonnet-4 --agent build" ./scripts/btask-run.sh --task <task-id> -- "Do the work"
```

`OPENCODE_BIN` and `BTASK_BIN` override the binaries used. The supervisor accepts success only after the model exits; it cannot interrupt a running session or force the model to reconcile tasks — it refuses to report success when the task is left unfinished.

## Development

```sh
bun run btask list
bun test
bun run typecheck
```
