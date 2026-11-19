import { native } from "#lib/native.ts"
import type { HarnessKind } from "#lib/p2p/protocol.ts"
import { templateFor } from "#lib/store/gatewayCatalog.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import type { Launch } from "./harnesses.ts"

export type ProviderKind = HarnessKind | "pi"

export const PI_BASE = "pi-acp"

const KEY_ENV = "ATRIX_PROVIDER_KEY"

const KEYLESS = "atrix"

const PI_DIR = ".atrix/pi"

export const providerKindOf = (harness: {
  kind: HarnessKind | null
  base: string
}): ProviderKind | null =>
  harness.kind ?? (harness.base === PI_BASE ? "pi" : null)

const trimSlash = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url)

const anthropicURL = (gateway: Gateway) => {
  const path = templateFor(gateway)?.anthropic

  return path === undefined ? undefined : new URL(gateway.baseURL).origin + path
}

export const servesKind = (kind: ProviderKind, gateway: Gateway) => {
  if (!gateway.key && !templateFor(gateway)?.keyless) {
    return false
  }

  switch (kind) {
    case "claude":
      return anthropicURL(gateway) !== undefined
    case "codex":
      return !!templateFor(gateway)?.responses
    case "pi":
      return true
  }
}

const claudeEnv = (gateway: Gateway, model: string) => ({
  ANTHROPIC_BASE_URL: anthropicURL(gateway) ?? "",
  ANTHROPIC_AUTH_TOKEN: gateway.key || KEYLESS,
  ANTHROPIC_API_KEY: "",
  ANTHROPIC_MODEL: model,
  ANTHROPIC_DEFAULT_OPUS_MODEL: model,
  ANTHROPIC_DEFAULT_SONNET_MODEL: model,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
})

const codexEnv = (gateway: Gateway, model: string) => {
  const template = templateFor(gateway)

  return {
    MODEL_PROVIDER: "atrix",
    CODEX_CONFIG: JSON.stringify({
      model,
      ...(!template?.codexDefaults && {
        web_search: "disabled",
        model_reasoning_effort: template?.reasoning ?? "low",
      }),
      model_providers: {
        atrix: {
          name: "Atrix",
          base_url: trimSlash(gateway.baseURL),
          env_key: KEY_ENV,
          wire_api: "responses",
        },
      },
    }),
    [KEY_ENV]: gateway.key || KEYLESS,
  }
}

const writePi = async (home: string, gateway: Gateway, model: string) => {
  const dir = `${home}/${PI_DIR}`
  const models = {
    providers: {
      atrix: {
        baseUrl: trimSlash(gateway.baseURL),
        api: "openai-completions",
        apiKey: `$${KEY_ENV}`,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          supportsStore: false,
        },
        models: [{ id: model, name: model, input: ["text", "image"] }],
      },
    },
  }
  const settings = {
    defaultProvider: "atrix",
    defaultModel: model,
    quietStartup: true,
    enableInstallTelemetry: false,
  }

  await native("write_text", {
    path: `${dir}/models.json`,
    content: JSON.stringify(models, null, 2),
  })
  await native("write_text", {
    path: `${dir}/settings.json`,
    content: JSON.stringify(settings, null, 2),
  })

  return { PI_CODING_AGENT_DIR: dir, [KEY_ENV]: gateway.key || KEYLESS }
}

const envOf = async (
  kind: ProviderKind,
  gateway: Gateway,
  model: string,
  home: string,
) => {
  switch (kind) {
    case "claude":
      return claudeEnv(gateway, model)
    case "codex":
      return codexEnv(gateway, model)
    case "pi":
      return writePi(home, gateway, model)
  }
}

export const prepareLaunch = async (
  kind: ProviderKind,
  launch: Launch,
  gateway: Gateway,
  model: string,
  home: string,
): Promise<Launch> => ({
  ...launch,
  env: { ...launch.env, ...(await envOf(kind, gateway, model, home)) },
})
