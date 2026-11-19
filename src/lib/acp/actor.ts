import type { Actor } from "#lib/knowledge/document.ts"
import type { SessionView } from "#lib/p2p/protocol.ts"
import { settings } from "#lib/store/settings.svelte.ts"

type Harness = { vendor: string | null; base: string }

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
  const vendor = entry?.vendor ?? "unknown"

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
