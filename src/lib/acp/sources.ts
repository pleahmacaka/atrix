import { join } from "@tauri-apps/api/path"
import { parse } from "yaml"
import { z } from "zod"
import { native } from "#lib/native.ts"
import type {
  Command,
  HarnessKind,
  Listed,
  TerminalDialog,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { claudeConfirm, claudeDialog } from "./claudeScreen.ts"
import type { Log } from "./items.ts"
import { applyRollout } from "./rollout.ts"
import { applyShells, applyTranscript, SHELL_NEEDLES } from "./transcript.ts"

export type Presence = {
  busy: boolean | null
  shell: boolean
  owner?: string
  pid?: number
  waiting?: string
  listing?: Listed
}

export type Source = {
  shared: boolean
  live: () => Promise<Map<string, Presence>>
  locate: (home: string, id: string, cwd: string) => Promise<string | null>
  apply: (log: Log, line: string) => void
  head?: { needles: string[]; apply: (log: Log, line: string) => void }
  commands?: (home: string) => Promise<Command[]>
  dialog?: (screen: string[]) => TerminalDialog | null
  confirm?: {
    command: (text: string) => boolean
    showing: (screen: string[]) => boolean
  }
}

const claudeRecords = z.array(
  z
    .object({
      sessionId: z.string(),
      pid: z.number().optional(),
      cwd: z.string().catch(""),
      name: z.string().catch(""),
      updatedAt: z.number().optional(),
      entrypoint: z.string().optional(),
      status: z.string().optional(),
      waitingFor: z.string().optional().catch(undefined),
    })
    .loose(),
)

const MIRRORED = new Set(["cli", "claude-desktop"])

const claudeBuiltins = (): Command[] => [
  {
    name: "compact",
    description: m.command_compact(),
    hint: m.command_compact_hint(),
  },
  { name: "clear", description: m.command_clear() },
  { name: "init", description: m.command_init() },
  { name: "review", description: m.command_review() },
  { name: "security-review", description: m.command_security_review() },
  { name: "pr-comments", description: m.command_pr_comments() },
  {
    name: "model",
    description: m.command_model(),
    hint: m.command_model_hint(),
  },
  {
    name: "add-dir",
    description: m.command_add_dir(),
    hint: m.command_add_dir_hint(),
  },
]

const skillMeta = z
  .object({ description: z.string().catch("") })
  .catch({ description: "" })

const describe = (text: string) => {
  const [, head = ""] = text.replaceAll("\r\n", "\n").split("---\n")

  try {
    return skillMeta.parse(parse(head)).description
  } catch {
    return ""
  }
}

const claudeSkills = async (home: string): Promise<Command[]> => {
  const root = await join(home, ".claude", "skills")
  const names = await native<string[]>("list_dirs", { path: root })
  const skills = await Promise.all(
    names
      .filter(name => !name.startsWith("."))
      .map(async name => {
        const text = await native<string | null>("read_text", {
          path: await join(root, name, "SKILL.md"),
        })

        return text === null ? [] : [{ name, description: describe(text) }]
      }),
  )

  return skills.flat()
}

const folderOf = (cwd: string) =>
  [...cwd].map(c => (/[a-z0-9]/i.test(c) ? c : "-")).join("")

const claude: Source = {
  shared: true,
  dialog: claudeDialog,
  confirm: claudeConfirm,
  live: async () =>
    new Map(
      claudeRecords
        .catch([])
        .parse(await native<unknown>("claude_presence"))
        .filter(p => MIRRORED.has(p.entrypoint ?? ""))
        .map(p => [
          p.sessionId,
          {
            busy: p.status === "busy",
            shell: p.status === "shell",
            owner: p.entrypoint,
            pid: p.pid,
            waiting:
              p.status === "waiting"
                ? (p.waitingFor ?? "permission prompt")
                : undefined,
            listing: {
              sessionId: p.sessionId,
              cwd: p.cwd,
              title: p.name,
              updatedAt: p.updatedAt
                ? new Date(p.updatedAt).toISOString()
                : null,
            },
          },
        ]),
    ),
  locate: (home, id, cwd) =>
    join(home, ".claude", "projects", folderOf(cwd), `${id}.jsonl`),
  apply: applyTranscript,
  head: { needles: SHELL_NEEDLES, apply: applyShells },
  commands: async home => [
    ...claudeBuiltins(),
    ...(await claudeSkills(home).catch(() => [])),
  ],
}

const codex: Source = {
  shared: false,
  live: async () =>
    new Map(
      (await native<string[]>("codex_presence")).map(id => [
        id,
        { busy: null, shell: false },
      ]),
    ),
  locate: (_home, id) => native<string | null>("codex_rollout", { id }),
  apply: applyRollout,
}

export const SOURCES: Record<HarnessKind, Source> = { claude, codex }
