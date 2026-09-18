#!/bin/sh
# btask-run.sh — supervised `opencode run` with an independent btask completion gate.
#
# Why a supervisor instead of a plugin: no documented OpenCode hook can veto
# turn completion. `session.idle` and `event` hooks are observers (the docs use
# them for notifications); throwing in `tool.execute.before` fails only that
# one tool call and the turn survives; `experimental.text.complete` only
# rewrites already-generated text before it is persisted. So enforcement lives
# here, outside the model: the run counts as successful only if independent
# checks pass after the model exits.
#
# Usage:
#   btask-run.sh --task <task-id> [--verify <shell-command>] [--] <prompt...>
#
# Environment:
#   OPENCODE_BIN  opencode binary (default: opencode)
#   BTASK_BIN     btask CLI (default: btask)
#   OPENCODE_ARGS extra args inserted before the prompt,
#                 e.g. OPENCODE_ARGS="--model anthropic/claude-sonnet-4 --agent build"
#
# Exit status: the opencode exit code if opencode fails, otherwise 1 when any
# gate fails, otherwise 0.

OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
BTASK_BIN="${BTASK_BIN:-btask}"

task_id=""
verify_cmd=""

while [ $# -gt 0 ]; do
  case "$1" in
    --task)
      task_id="${2:-}"
      shift 2
      ;;
    --verify)
      verify_cmd="${2:-}"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    --task=*|--verify=*)
      echo "btask-run: use '--task <id>' / '--verify <cmd>' with a space, not '='." >&2
      exit 2
      ;;
    -h|--help)
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [ -z "$task_id" ]; then
  echo "btask-run: --task <task-id> is required." >&2
  exit 2
fi
if [ $# -eq 0 ]; then
  echo "btask-run: a prompt is required." >&2
  exit 2
fi

# Gate 0: the model runs to completion first; its output is held until exit.
# shellcheck disable=SC2086
"$OPENCODE_BIN" run $OPENCODE_ARGS -- "$@"
opencode_status=$?
if [ "$opencode_status" -ne 0 ]; then
  echo "btask-run: opencode exited with status $opencode_status; accepting failure without verification." >&2
  exit "$opencode_status"
fi

# Gate 1: the tracked task must actually be finished. The CLI prints
# pretty-printed JSON, so a status embedded in a title or notes would appear
# JSON-escaped (\") and cannot match this grep.
get_out=$("$BTASK_BIN" get "$task_id" 2>&1) || {
  echo "btask-run: btask gate failed — could not read task $task_id: $get_out" >&2
  exit 1
}
case "$get_out" in
  *'"status": "finished"'*)
    ;;
  *)
    echo "btask-run: btask gate failed — task $task_id is not finished; refusing success." >&2
    exit 1
    ;;
esac

# Gate 2: caller-supplied verification (tests, typecheck, acceptance checks).
if [ -n "$verify_cmd" ]; then
  sh -c "$verify_cmd"
  verify_status=$?
  if [ "$verify_status" -ne 0 ]; then
    echo "btask-run: verify gate failed with status $verify_status; refusing success." >&2
    exit 1
  fi
fi

echo "btask-run: task $task_id finished and all gates passed."
