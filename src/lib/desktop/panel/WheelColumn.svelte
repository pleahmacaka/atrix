<script lang="ts">
import { on } from "svelte/events"

let {
  count,
  selected,
  label,
  pick,
}: {
  count: number
  selected: number
  label: string
  pick: (value: number) => void
} = $props()

const id = $props.id()

const values = $derived(Array.from({ length: count }, (_, i) => i))

let list: HTMLElement | undefined

const rowHeight = () => list?.firstElementChild?.clientHeight ?? 0

const scrollTo = (index: number, behavior: ScrollBehavior = "smooth") => {
  const clamped = Math.min(Math.max(index, 0), count - 1)

  list?.scrollTo({ top: clamped * rowHeight(), behavior })
}

const settle = () => {
  const height = rowHeight()

  if (!list || !height) {
    return
  }

  const index = Math.round(list.scrollTop / height)

  if (index !== selected) {
    pick(index)
  }
}

const keydown = (e: KeyboardEvent) => {
  const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0

  if (step) {
    e.preventDefault()
    scrollTo(selected + step)
  }
}

const mount = (node: HTMLElement) => {
  list = node
  scrollTo(selected, "instant")

  return on(node, "scrollend", settle)
}
</script>

<div class="relative h-40 w-14">
  <div
    class="pointer-events-none absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-field bg-base-content/8"
  ></div>
  <div
    {@attach mount}
    role="listbox"
    tabindex="0"
    aria-label={label}
    aria-activedescendant="{id}-{selected}"
    class={[
      "relative h-full snap-y snap-mandatory overflow-y-auto py-16",
      "fade-y scrollbar-none",
    ]}
    onkeydown={keydown}
  >
    {#each values as value (value)}
      <button
        type="button"
        id="{id}-{value}"
        role="option"
        aria-selected={value === selected}
        tabindex="-1"
        class={[
          "flex h-8 w-full cursor-pointer snap-center items-center justify-center",
          "text-base tabular-nums transition-colors duration-120",
          value === selected ? "font-medium text-primary" : "text-base-content/45",
        ]}
        onclick={() => scrollTo(value)}
      >
        {String(value).padStart(2, "0")}
      </button>
    {/each}
  </div>
</div>
