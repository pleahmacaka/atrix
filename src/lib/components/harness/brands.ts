const BRANDS: Record<string, string> = {
  "claude-acp": "simple-icons:claude",
  "codex-acp": "simple-icons:openai",
  gemini: "simple-icons:googlegemini",
  "antigravity-acp": "devicon-plain:antigravity",
  bob: "simple-icons:ibm",
  "codebuddy-code": "simple-icons:codebuddy",
  deepagents: "simple-icons:langchain",
  devin: "logos:devin",
  "glm-acp-agent": "thesvg:zhipu",
  goose: "thesvg:goose-codename",
  "github-copilot-cli": "simple-icons:githubcopilot",
  cursor: "simple-icons:cursor",
  cline: "simple-icons:cline",
  opencode: "simple-icons:opencode",
  "opencode-v2": "simple-icons:opencode",
  junie: "thesvg:junie",
  "amp-acp": "simple-icons:sourcegraph",
  "cortex-code": "simple-icons:snowflake",
  kimi: "simple-icons:kimi",
  "kimi-code": "simple-icons:kimi",
  "minimax-code": "simple-icons:minimax",
  "mistral-vibe": "simple-icons:mistralai",
  "qwen-code": "simple-icons:qwen",
  "grok-build": "thesvg:grok-xai",
}

export const OFFICIAL = new Set(["claude-acp", "codex-acp", "gemini"])

export const brandIcon = (base: string) => BRANDS[base] ?? "lucide:bot"
