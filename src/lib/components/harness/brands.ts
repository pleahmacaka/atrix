import { addIcon } from "@iconify/svelte"

const OPENCODE_V2 = "atrix:opencode-v2"

addIcon(OPENCODE_V2, {
  width: 24,
  height: 24,
  body: [
    '<path fill="currentColor" transform="translate(0 1) scale(.75)" d="M22 24H2V0h20zM17 4.8H7v14.4h10z"/>',
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18.2 15.6a2.3 2.3 0 0 1 4.6 0c0 1.4-1.1 2.1-2.1 2.9L18.2 22h4.6"/>',
  ].join(""),
})

const BRANDS: Record<string, string> = {
  "claude-acp": "simple-icons:claude",
  "codex-acp": "simple-icons:openai",
  gemini: "simple-icons:googlegemini",
  bob: "simple-icons:ibm",
  "codebuddy-code": "simple-icons:codebuddy",
  deepagents: "simple-icons:langchain",
  "deepseek-acp": "simple-icons:deepseek",
  devin: "logos:devin",
  "glm-acp-agent": "thesvg:zhipu",
  goose: "thesvg:goose-codename",
  "github-copilot-cli": "simple-icons:githubcopilot",
  cursor: "simple-icons:cursor",
  cline: "simple-icons:cline",
  opencode: "simple-icons:opencode",
  "opencode-v2": OPENCODE_V2,
  junie: "thesvg:junie",
  "amp-acp": "simple-icons:sourcegraph",
  "cortex-code": "simple-icons:snowflake",
  "kimi-code": "simple-icons:kimi",
  "minimax-code": "simple-icons:minimax",
  "mistral-vibe": "simple-icons:mistralai",
  "qwen-code": "simple-icons:qwen",
  "grok-build": "thesvg:grok-xai",
}

export const OFFICIAL = new Set(["claude-acp", "codex-acp", "gemini"])

export const brandIcon = (base: string) => BRANDS[base] ?? "lucide:bot"

const REPO_HOSTS: [string, string][] = [
  ["github", "simple-icons:github"],
  ["gitlab", "simple-icons:gitlab"],
  ["bitbucket", "simple-icons:bitbucket"],
  ["codeberg", "simple-icons:codeberg"],
  ["gitea", "simple-icons:gitea"],
  ["forgejo", "simple-icons:forgejo"],
  ["sr.ht", "simple-icons:sourcehut"],
  ["gitee", "simple-icons:gitee"],
  ["dev.azure.com", "simple-icons:azuredevops"],
  ["visualstudio.com", "simple-icons:azuredevops"],
]

export const repoIcon = (remote: string | null) =>
  REPO_HOSTS.find(([host]) => remote?.toLowerCase().includes(host))?.[1] ??
  "simple-icons:git"
