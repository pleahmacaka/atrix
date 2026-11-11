import { SvelteSet } from "svelte/reactivity"
import { keyOf } from "./keys.ts"
import { panes } from "./panes.svelte.ts"

export const unread = new SvelteSet<string>()

const visible = (key: string) =>
  panes.leaves.some(l => l.current && keyOf(l.current) === key)

export const markUnread = (key: string) => {
  if (!visible(key)) {
    unread.add(key)
  }
}

export const markRead = (key: string) => {
  unread.delete(key)
}
