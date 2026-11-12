import { join } from "@tauri-apps/api/path"
import { z } from "zod"
import type { HarnessKind } from "#lib/p2p/protocol.ts"
import type { Log } from "./items.ts"
import { native } from "./native.ts"
import { applyRollout } from "./rollout.ts"
import { applyShells, applyTranscript, SHELL_NEEDLES } from "./transcript.ts"

export type Presence = { busy: boolean | null; shell: boolean }

export type Source = {
  shared: boolean
  live: () => Promise<Map<string, Presence>>
  locate: (home: string, id: string, cwd: string) => Promise<string | null>
  apply: (log: Log, line: string) => void
  head?: { needles: string[]; apply: (log: Log, line: string) => void }
}

const claudeRecords = z.array(
  z
    .object({
      sessionId: z.string(),
      entrypoint: z.string().optional(),
      status: z.string().optional(),
    })
    .loose(),
)

const folderOf = (cwd: string) =>
  [...cwd].map(c => (/[a-z0-9]/i.test(c) ? c : "-")).join("")

const claude: Source = {
  shared: true,
  live: async () =>
    new Map(
      claudeRecords
        .catch([])
        .parse(await native<unknown>("claude_presence"))
        .filter(p => p.entrypoint === "cli")
        .map(p => [
          p.sessionId,
          { busy: p.status === "busy", shell: p.status === "shell" },
        ]),
    ),
  locate: (home, id, cwd) =>
    join(home, ".claude", "projects", folderOf(cwd), `${id}.jsonl`),
  apply: applyTranscript,
  head: { needles: SHELL_NEEDLES, apply: applyShells },
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
