import type { Actor } from "#lib/knowledge/document.ts"
import type { HarnessKind, SessionView } from "#lib/p2p/protocol.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const VENDORS: Record<HarnessKind, string> = {
  claude: "anthropic",
  codex: "openai",
}

type Harness = { kind: HarnessKind | null; base: string }

type Running = {
  info: { name: string; version: string } | null
  model?: string
}

export const actorFor = (
  sessionId: string,
  view: SessionView | undefined,
  entry: Harness | undefined,
  live: Running | undefined,
): Actor => {
  const vendor = entry?.kind ? VENDORS[entry.kind] : "unknown"

  return {
    kind: "agent",
    agent: view?.title || sessionId,
    session: `atrix:${sessionId}`,
    device: settings.deviceName || "unknown",
    harness: live?.info ?? {
      name: entry?.base ?? "unknown",
      version: "unknown",
    },
    model: { id: live?.model ?? "unknown", vendor },
    route: [{ kind: "provider", name: vendor }],
  }
}
