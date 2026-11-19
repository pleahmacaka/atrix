import type { Wire } from "#lib/p2p/protocol.ts"
import { templateFor } from "#lib/store/gatewayCatalog.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"

export type Provider = {
  wire: Wire
  baseUrl: string
  key: string | null
  headers: Record<string, string>
}

const anthropicURL = (gateway: Gateway, path: string) =>
  new URL(gateway.baseURL).origin + path

export const providerFor = (
  gateway: Gateway,
  wires: readonly Wire[],
): Provider | null => {
  const template = templateFor(gateway)

  if (!gateway.key && !template?.keyless) {
    return null
  }

  const at = (wire: Wire, baseUrl: string): Provider => ({
    wire,
    baseUrl,
    key: gateway.key,
    headers: {},
  })

  if (wires.includes("open-ai-chat")) {
    return at("open-ai-chat", gateway.baseURL)
  }

  if (template?.responses && wires.includes("open-ai-responses")) {
    return at("open-ai-responses", gateway.baseURL)
  }

  if (
    template?.anthropic !== undefined &&
    wires.includes("anthropic-messages")
  ) {
    return at("anthropic-messages", anthropicURL(gateway, template.anthropic))
  }

  return null
}
