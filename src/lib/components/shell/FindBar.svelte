<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"

const ALL = "find"

const CURRENT = "find-current"

let bar = $state<HTMLElement>()

let query = $state("")

let ranges = $state.raw<Range[]>([])

let index = $state(0)

const rootOf = () => document.querySelector<HTMLElement>("[data-find-root]")

const clipped = (range: Range, root: HTMLElement) => {
  const rect = range.getBoundingClientRect()

  for (let el = range.startContainer.parentElement; el && el !== root; el = el.parentElement) {
    const { overflowX } = getComputedStyle(el)

    if (overflowX !== "hidden" && overflowX !== "clip") {
      continue
    }

    const box = el.getBoundingClientRect()

    if (rect.right > box.right + 1 || rect.left < box.left - 1) {
      return true
    }
  }

  return false
}

const collect = (root: HTMLElement, needle: string) => {
  const found: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const lower = needle.toLowerCase()

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.checkVisibility({ visibilityProperty: true })) {
      continue
    }

    const text = node.textContent?.toLowerCase() ?? ""

    for (let at = text.indexOf(lower); at !== -1; at = text.indexOf(lower, at + lower.length)) {
      const range = new Range()

      range.setStart(node, at)
      range.setEnd(node, at + lower.length)

      if (!clipped(range, root)) {
        found.push(range)
      }
    }
  }

  return found
}

const scrollerOf = (node: Node) => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
  }

  return document.scrollingElement
}

const reveal = (range: Range) => {
  const scroller = scrollerOf(range.startContainer)

  if (!scroller) {
    return
  }

  const match = range.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  const offset = match.top + match.height / 2 - (view.top + view.height / 2)

  scroller.scrollBy({ top: offset, behavior: "smooth" })
}

const paint = (scroll: boolean) => {
  CSS.highlights.set(ALL, new Highlight(...ranges))

  const current = ranges[index]

  if (current) {
    CSS.highlights.set(CURRENT, new Highlight(current))

    if (scroll) {
      reveal(current)
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

  const input = bar?.querySelector("input")

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
    bind:this={bar}
    class={[
      "popover-box absolute top-12 right-4 z-40 flex items-center gap-1 p-1",
      "max-sm:inset-x-4",
    ]}
  >
    <SearchField
      bind:value={query}
      label={m.find_label()}
      class="w-56 max-sm:w-auto max-sm:flex-1"
      oninput={() => {
        index = 0
        search(true)
      }}
      onkeydown={keydown}
    />
    <span class="min-w-14 shrink-0 text-center text-xs text-base-content/60 tabular-nums">
      {ranges.length ? `${index + 1}/${ranges.length}` : query ? "0/0" : ""}
    </span>
    <IconButton
      icon="lucide:chevron-up"
      label={m.common_previous()}
      title="${m.common_previous()} (Shift+Enter)"
      class="shrink-0"
      disabled={ranges.length === 0}
      onclick={() => step(-1)}
    />
    <IconButton
      icon="lucide:chevron-down"
      label={m.common_next()}
      title="${m.common_next()} (Enter)"
      class="shrink-0"
      disabled={ranges.length === 0}
      onclick={() => step(1)}
    />
    <IconButton
      icon="lucide:x"
      label={m.common_close()}
      title={m.common_close_hint()}
      class="shrink-0"
      onclick={close}
    />
  </search>
{/if}
