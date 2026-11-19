export const FRONTIER_MODELS = [
  "GLM-5.3",
  "GLM-5.3-Flash",
  "DeepSeek-V4.1-Flash-1017",
  "muse-spark-open",
  "Kimi-K3",
] as const

export const FRONTIER_VENDORS: Record<FrontierModel, string> = {
  "GLM-5.3": "zai-org",
  "GLM-5.3-Flash": "zai-org",
  "DeepSeek-V4.1-Flash-1017": "deepseek-ai",
  "muse-spark-open": "meta-models",
  "Kimi-K3": "moonshotai",
}

export type FrontierModel = (typeof FRONTIER_MODELS)[number]

export type FrontierRow = {
  name: string
  harness: string | null
  pass: number
  allModels: number
  byModel: Record<FrontierModel, number>
}

const scores = (
  glm: number,
  flash: number,
  deepseek: number,
  muse: number,
  kimi: number,
): Record<FrontierModel, number> => ({
  "GLM-5.3": glm,
  "GLM-5.3-Flash": flash,
  "DeepSeek-V4.1-Flash-1017": deepseek,
  "muse-spark-open": muse,
  "Kimi-K3": kimi,
})

const row = (
  name: string,
  harness: string | null,
  pass: number,
  byModel: Record<FrontierModel, number>,
  allModels: number,
): FrontierRow => ({ name, harness, pass, allModels, byModel })

export const FRONTIER_SOURCE = "FrontierHarness Eval v1.1.0"

export const FRONTIER: FrontierRow[] = [
  row(
    "Codex CLI",
    "codex-acp",
    61.1,
    scores(0.803, 0.226, 0.237, 1.69, 1.78),
    0.937,
  ),
  row("Pi", "pi-acp", 57.7, scores(1.55, 0.223, 0.21, 1.47, 1.54), 0.976),
  row(
    "OpenCode v2",
    "opencode-v2",
    57.3,
    scores(1.53, 0.254, 0.27, 1.35, 1.61),
    0.978,
  ),
  row(
    "Oh My Pi",
    "oh-my-pi",
    57.3,
    scores(1.74, 0.273, 0.25, 1.21, 1.45),
    0.983,
  ),
  row("ZCode", "zcode-acp", 61.9, scores(1.48, 0.264, 0.222, 1.79, 1.66), 1.06),
  row(
    "KimiCode",
    "kimi-code",
    60.2,
    scores(1.55, 0.379, 0.264, 1.49, 1.84),
    1.09,
  ),
  row(
    "OpenCode v1",
    "opencode",
    57.4,
    scores(1.62, 0.287, 0.177, 1.79, 1.74),
    1.12,
  ),
  row("Maka", null, 57.7, scores(1.48, 0.259, 0.193, 1.5, 2.22), 1.13),
  row(
    "MiniMax Code",
    "minimax-code",
    56.8,
    scores(1.76, 0.323, 0.256, 1.67, 1.7),
    1.14,
  ),
  row(
    "DSH Minimal",
    "deepseek-acp",
    57.4,
    scores(1.88, 0.484, 0.256, 1.54, 1.7),
    1.15,
  ),
  row(
    "Hermes Agent",
    "hermes-agent",
    59.9,
    scores(1.66, 0.328, 0.314, 1.69, 1.82),
    1.16,
  ),
  row("Cline CLI", "cline", 57.7, scores(1.55, 0.261, 0.86, 1.59, 1.75), 1.19),
  row(
    "Grok Build",
    "grok-build",
    60,
    scores(1.81, 0.321, 0.284, 1.77, 1.81),
    1.2,
  ),
  row("Alma", null, 59.7, scores(1.62, 0.295, 0.249, 2.4, 1.58), 1.22),
  row("DSH Standard", null, 55, scores(2, 0.449, 0.292, 1.77, 1.95), 1.27),
  row("DSH Creator", null, 56.1, scores(2.19, 0.466, 0.273, 1.34, 2.25), 1.27),
  row(
    "mini-SWE-agent",
    null,
    58.6,
    scores(2.03, 0.445, 0.219, 1.77, 2.02),
    1.29,
  ),
  row("DSH Code", null, 55.2, scores(2.1, 0.372, 0.243, 2.08, 2.11), 1.32),
  row("Exo", null, 50.6, scores(2.72, 0.424, 0.336, 1.34, 2.24), 1.36),
  row(
    "GitHub Copilot CLI",
    "github-copilot-cli",
    56.9,
    scores(1.76, 0.302, 0.492, 2.96, 1.8),
    1.38,
  ),
  row(
    "Claude Code",
    "claude-acp",
    58.9,
    scores(1.77, 0.367, 0.285, 3.75, 1.94),
    1.55,
  ),
]

export const SUBSCRIPTIONS = [
  { id: "claude", label: "Claude Pro / Max", harness: "claude-acp" },
  { id: "chatgpt", label: "ChatGPT Plus / Pro", harness: "codex-acp" },
  { id: "copilot", label: "GitHub Copilot", harness: "github-copilot-cli" },
  { id: "glm", label: "GLM Coding Plan", harness: "zcode-acp" },
  { id: "kimi", label: "Kimi", harness: "kimi-code" },
  { id: "grok", label: "SuperGrok", harness: "grok-build" },
  { id: "minimax", label: "MiniMax", harness: "minimax-code" },
] as const

export type AdvisorPick =
  | { kind: "model"; model: FrontierModel }
  | { kind: "subscription"; id: string }
  | { kind: "harness"; name: string }
  | null

export type Advice = {
  row: FrontierRow
  model: FrontierModel | null
  cost: number
}

const subscribedHarness = (pick: AdvisorPick) =>
  pick?.kind === "subscription"
    ? SUBSCRIPTIONS.find(s => s.id === pick.id)?.harness
    : undefined

export const advise = (
  pick: AdvisorPick,
  usable: (r: FrontierRow) => boolean,
) => {
  const rows = FRONTIER.filter(usable)

  if (pick?.kind === "model") {
    return rows
      .map(r => ({ row: r, model: pick.model, cost: r.byModel[pick.model] }))
      .toSorted((a, b) => a.cost - b.cost)
  }

  const subscribed = subscribedHarness(pick)
  const pool =
    pick?.kind === "harness"
      ? rows.filter(r => r.name === pick.name)
      : subscribed
        ? rows.filter(r => r.harness === subscribed)
        : rows

  return pool
    .map(r => ({ row: r, model: null, cost: r.allModels }))
    .toSorted((a, b) => a.cost - b.cost)
}
