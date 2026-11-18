import type { HarnessKind } from "#lib/p2p/protocol.ts"
import { templateFor } from "#lib/store/gatewayCatalog.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import type { Launch } from "./harnesses.ts"

const trimmed = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url)

const anthropicURL = (gateway: Gateway) => {
  const path = templateFor(gateway)?.anthropic

  return path === undefined ? undefined : new URL(gateway.baseURL).origin + path
}

export const servesKind = (kind: HarnessKind, gateway: Gateway) => {
  if (!gateway.key && !templateFor(gateway)?.keyless) {
    return false
  }

  switch (kind) {
    case "claude":
      return anthropicURL(gateway) !== undefined
    case "codex":
      return !!templateFor(gateway)?.responses
  }
}

const claudeEnv = (gateway: Gateway, model: string) => ({
  ANTHROPIC_BASE_URL: anthropicURL(gateway) ?? "",
  ANTHROPIC_AUTH_TOKEN: gateway.key || "atrix",
  ANTHROPIC_API_KEY: "",
  ANTHROPIC_MODEL: model,
  ANTHROPIC_DEFAULT_OPUS_MODEL: model,
  ANTHROPIC_DEFAULT_SONNET_MODEL: model,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
})

const codexArgs = (gateway: Gateway, model: string) =>
  [
    'model_provider="atrix"',
    'model_providers.atrix.name="Atrix"',
    `model_providers.atrix.base_url=${JSON.stringify(trimmed(gateway.baseURL))}`,
    'model_providers.atrix.env_key="ATRIX_PROVIDER_KEY"',
    'model_providers.atrix.wire_api="responses"',
    `model=${JSON.stringify(model)}`,
  ].flatMap(pair => ["-c", pair])

export const withProvider = (
  kind: HarnessKind,
  launch: Launch,
  gateway: Gateway,
  model: string,
): Launch => {
  switch (kind) {
    case "claude":
      return { ...launch, env: { ...launch.env, ...claudeEnv(gateway, model) } }
    case "codex":
      return {
        ...launch,
        args: [...launch.args, ...codexArgs(gateway, model)],
        env: { ...launch.env, ATRIX_PROVIDER_KEY: gateway.key || "atrix" },
      }
  }
}
