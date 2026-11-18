import type { Available } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const EXTRA_DESCRIPTIONS: Record<string, () => string> = {
  "deepseek-acp": m.harness_desc_deepseek,
  "hermes-agent": m.harness_desc_hermes,
  "oh-my-pi": m.harness_desc_omp,
  omo: m.harness_desc_omo,
  "zcode-acp": m.harness_desc_zcode,
}

export const describeHarness = (harness: Available) =>
  harness.description || (EXTRA_DESCRIPTIONS[harness.id]?.() ?? "")
