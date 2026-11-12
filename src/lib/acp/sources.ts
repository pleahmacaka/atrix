import { join } from "@tauri-apps/api/path"
import { z } from "zod"
import type { HarnessKind } from "#lib/p2p/protocol.ts"
import type { Log } from "./items.ts"
import { native } from "./native.ts"
import { applyRollout } from "./rollout.ts"
import { applyTranscript } from "./transcript.ts"

export type Source = {
  shared: boolean
  live: () => Promise<Map<string, boolean | null>>
  locate: (home: string, id: string, cwd: string) => Promise<string | null>
  apply: (log: Log, line: string) => void
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
        .map(p => [p.sessionId, p.status === "busy"]),
    ),
  locate: (home, id, cwd) =>
    join(home, ".claude", "projects", folderOf(cwd), `${id}.jsonl`),
  apply: applyTranscript,
}

const codex: Source = {
  shared: false,
  live: async () =>
    new Map((await native<string[]>("codex_presence")).map(id => [id, null])),
  locate: (_home, id) => native<string | null>("codex_rollout", { id }),
  apply: applyRollout,
}

export const SOURCES: Record<HarnessKind, Source> = { claude, codex }
