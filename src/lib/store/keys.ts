import type { Current } from "./nav.svelte.ts"

export const keyOf = (current: NonNullable<Current>) =>
  current.kind === "chat" ? current.id : `${current.host}:${current.id}`
