<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import ShortcutKeys from "./ShortcutKeys.svelte"

let {
  value,
  onchange,
}: { value: string; onchange: (shortcut: string) => void } = $props()

const NAMED = new Set([
  "Space",
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Comma",
  "Period",
  "Slash",
  "Backslash",
  "Semicolon",
  "Quote",
  "Backquote",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
])

let recording = $state(false)

const keys = $derived(value.split("+").map(k => (k === "Super" ? "Win" : k)))

const keyName = (code: string) => {
  if (code.startsWith("Key")) {
    return code.slice(3)
  }

  if (code.startsWith("Digit") || code.startsWith("Arrow")) {
    return code.slice(5)
  }

  if (code.startsWith("F") && Number.isInteger(Number(code.slice(1)))) {
    return code
  }

  return NAMED.has(code) ? code : null
}

const record = (e: KeyboardEvent) => {
  if (!recording) {
    return
  }

  e.preventDefault()
  e.stopPropagation()

  if (e.key === "Escape") {
    recording = false

    return
  }

  const key = keyName(e.code)
  const modifiers = [
    e.ctrlKey && "Ctrl",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.metaKey && "Super",
  ].filter(Boolean)

  if (key && modifiers.length > 0) {
    recording = false
    onchange([...modifiers, key].join("+"))
  }
}
</script>

<button
  type="button"
  class={[
    "input input-sm w-44 cursor-pointer justify-between gap-2 whitespace-nowrap",
    "transition-colors duration-140 hover:bg-base-content/5 max-sm:w-full",
    recording && "animate-pulse border-primary text-primary",
  ]}
  aria-label={m.shortcut_change({ name: m.desktop_launcher_shortcut() })}
  aria-pressed={recording}
  onclick={() => (recording = !recording)}
  onkeydown={record}
  onblur={() => (recording = false)}
>
  <Icon icon="lucide:keyboard" class="size-4 shrink-0 opacity-50" />
  <span class="flex min-w-0 items-center justify-end gap-1">
    {#if recording}
      <span class="truncate text-sm">{m.shortcut_recording()}</span>
    {:else}
      <ShortcutKeys {keys} />
    {/if}
  </span>
</button>
