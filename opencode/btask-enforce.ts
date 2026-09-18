import type { Plugin } from "@opencode-ai/plugin"

const MARKER = "btask lifecycle"
const REMINDER = `## btask lifecycle (persistent rule)
Multi-step work must be tracked in btask: run \`btask context\` + \`btask list\` first, create a goal + subtask before each unit of work, set in_progress when starting, finished when verified, and reconcile every owned task before ending the turn (never leave in_progress). Full contract: ~/.agents/btask-contract.md.`
const COMPACTION_CONTEXT = `## btask lifecycle — survives compaction
Multi-step work requires btask tracking (btask context/list first, subtask per unit of work, in_progress -> finished, reconcile before ending turn). Never leave owned tasks in_progress. Contract: ~/.agents/btask-contract.md.`

type BtaskNode = { task?: { status?: string }; children?: BtaskNode[] }

function hasInProgress(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false
  const walk = (list: BtaskNode[]): boolean =>
    list.some((n) => {
      if (!n || typeof n !== "object") return false
      if ((n as BtaskNode).task?.status === "in_progress") return true
      const kids = (n as BtaskNode).children
      return Array.isArray(kids) ? walk(kids) : false
    })
  return walk(nodes as BtaskNode[])
}

export const BtaskEnforcePlugin: Plugin = async ({ client, $ }) => {
  async function hasUnreconciledTasks(): Promise<boolean> {
    try {
      const out = await $`btask list`.quiet().nothrow()
      if (out.exitCode !== 0) return false
      return hasInProgress(out.json())
    } catch {
      return false
    }
  }

  async function warnUnreconciledTasks(sessionID: string): Promise<void> {
    try {
      if (!(await hasUnreconciledTasks())) return
      await client.app
        .log({
          body: {
            service: "btask-enforce",
            level: "warn",
            message: `Unreconciled btask tasks at session idle (${sessionID}). Reconcile owned tasks before ending the turn.`,
          },
        })
        .catch(() => {})
      await client.tui
        .showToast({
          body: {
            title: "btask: unreconciled tasks",
            message: "in_progress btask tasks remain — reconcile before ending the turn.",
            variant: "warning",
          },
        })
        .catch(() => {})
    } catch {
      // never break the session
    }
  }

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        const joined = output.system.join("\n")
        if (!joined.includes(MARKER)) output.system.push(REMINDER)
      } catch {
        // ignore
      }
    },
    "experimental.session.compacting": async (_input, output) => {
      try {
        output.context.push(COMPACTION_CONTEXT)
      } catch {
        // ignore
      }
    },
    event: async ({ event }) => {
      try {
        if (event.type === "session.idle") {
          const props = event.properties as { sessionID?: string }
          await warnUnreconciledTasks(props.sessionID ?? "unknown")
        }
      } catch {
        // ignore
      }
    },
  }
}
