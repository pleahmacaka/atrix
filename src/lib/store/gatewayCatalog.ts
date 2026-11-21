import { type Gateway, local } from "./local.svelte.ts"

export const OPENROUTER_ID = "openrouter"

export const OPENROUTER_URL = "https://openrouter.ai/api/v1"

export const OPENROUTER_MODEL = "openrouter/auto"

export type Template = {
  id: string
  name: string
  icon: string
  baseURL: string
  oauth?: boolean
  anthropic?: string
  responses?: boolean
  codexDefaults?: boolean
  reasoning?: "none" | "low" | "high"
  keyless?: boolean
}

export const CUSTOM_TEMPLATE = "custom"

export const TEMPLATES: Template[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "simple-icons:openrouter",
    baseURL: OPENROUTER_URL,
    anthropic: "/api",
    responses: true,
    oauth: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "simple-icons:openai",
    baseURL: "https://api.openai.com/v1",
    responses: true,
    codexDefaults: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    icon: "simple-icons:mistralai",
    baseURL: "https://api.mistral.ai/v1",
    responses: true,
    reasoning: "none",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "simple-icons:googlegemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "simple-icons:deepseek",
    baseURL: "https://api.deepseek.com/v1",
    anthropic: "/anthropic",
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: "simple-icons:ollama",
    baseURL: "http://localhost:11434/v1",
    anthropic: "",
    keyless: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    icon: "simple-icons:lmstudio",
    baseURL: "http://localhost:1234/v1",
  },
]

export const templateOf = (baseURL: string) =>
  TEMPLATES.find(t => t.baseURL === baseURL)

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace("127.0.0.1", "localhost")
  } catch {
    return ""
  }
}

export const templateFor = (gateway: Pick<Gateway, "baseURL">) =>
  TEMPLATES.find(t => hostOf(t.baseURL) === hostOf(gateway.baseURL))

export const activeGateways = () => local.data.gateways.filter(g => !g.removed)

export const findGateway = (id: string) =>
  activeGateways().find(g => g.id === id)
