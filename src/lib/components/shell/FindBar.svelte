<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"

const ALL = "find"

const CURRENT = "find-current"

let input = $state<HTMLInputElement>()

let query = $state("")

let ranges = $state.raw<Range[]>([])

let index = $state(0)

const rootOf = () => document.querySelector<HTMLElement>("[data-find-root]")

const collect = (root: HTMLElement, needle: string) => {
  const found: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const lower = needle.toLowerCase()

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.toLowerCase() ?? ""

    for (let at = text.indexOf(lower); at !== -1; at = text.indexOf(lower, at + lower.length)) {
      const range = new Range()

      range.setStart(node, at)
      range.setEnd(node, at + lower.length)
      found.push(range)
    }
  }

  return found
}

const paint = (scroll: boolean) => {
  CSS.highlights.set(ALL, new Highlight(...ranges))

  const current = ranges[index]

  if (current) {
    CSS.highlights.set(CURRENT, new Highlight(current))

    if (scroll) {
      current.startContainer.parentElement?.scrollIntoView({ block: "center" })
    }
  } else {
    CSS.highlights.delete(CURRENT)
  }
}

const search = (scroll = false) => {
  const root = rootOf()

  ranges = root && query ? collect(root, query) : []
  index = Math.min(index, Math.max(ranges.length - 1, 0))
  paint(scroll)
}

const step = (delta: number) => {
  if (ranges.length === 0) {
    return
  }

  index = (index + delta + ranges.length) % ranges.length
  paint(true)
}

const close = () => {
  nav.find = false
}

$effect(() => {
  if (!nav.find) {
    return
  }

  input?.focus()
  input?.select()

  const root = rootOf()
  let frame = 0
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => search())
  })

  if (root) {
    observer.observe(root, { subtree: true, characterData: true, childList: true })
  }

  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    CSS.highlights.delete(ALL)
    CSS.highlights.delete(CURRENT)
  }
})

const keydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault()
    step(e.shiftKey ? -1 : 1)
  } else if (e.key === "Escape") {
    e.preventDefault()
    close()
  }
}
</script>

{#if nav.find}
  <search
    class={[
      "absolute top-12 right-4 z-40 flex items-center gap-1 rounded-box border",
      "border-base-300 bg-raised p-1 shadow-lg",
    ]}
  >
    <label class="input input-sm input-ghost w-56">
      <Icon icon="lucide:search" class="size-4 opacity-60" />
      <input
        bind:this={input}
        class="grow"
        placeholder={m.find_label()}
        aria-label={m.find_label()}
        bind:value={query}
        oninput={() => {
          index = 0
          search(true)
        }}
        onkeydown={keydown}
      />
    </label>
    <span class="min-w-14 text-center text-xs text-base-content/60 tabular-nums">
      {ranges.length ? `${index + 1}/${ranges.length}` : query ? "0/0" : ""}
    </span>
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-square"
      aria-label={m.common_previous()}
      title="{m.common_previous()} (Shift+Enter)"
      disabled={ranges.length === 0}
      onclick={() => step(-1)}
    >
      <Icon icon="lucide:chevron-up" class="size-4" />
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-square"
      aria-label={m.common_next()}
      title="{m.common_next()} (Enter)"
      disabled={ranges.length === 0}
      onclick={() => step(1)}
    >
      <Icon icon="lucide:chevron-down" class="size-4" />
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-square"
      aria-label={m.common_close()}
      title={m.common_close_hint()}
      onclick={close}
    >
      <Icon icon="lucide:x" class="size-4" />
    </button>
  </search>
{/if}
