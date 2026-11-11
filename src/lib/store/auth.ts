import { sync } from "#lib/p2p/sync.svelte.ts"
import { local } from "./local.svelte.ts"

export const setOpenRouterKey = async (key: string | null) => {
  local.data.openrouter = { key, at: Date.now() }
  await local.save()
  sync.shareAuth()
}
