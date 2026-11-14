<script lang="ts">
import Icon from "@iconify/svelte"

type Item = { key: string; icon: string; label: string; group: string }

let {
  items,
  value,
  label,
  onpick,
}: {
  items: Item[]
  value: string
  label: string
  onpick: (key: string) => void
} = $props()

const uid = $props.id()

const NOTCH = 100

const SETTLE_MS = 140

const index = $derived(
  Math.max(
    0,
    items.findIndex(i => i.key === value),
  ),
)

const current = $derived(items[index])

let carry = 0

let last = 0

let moved = 0

const IDLE_MS = 400

const step = (direction: number) => {
  if (items.length === 0) {
    return
  }

  const next = (index + direction + items.length) % items.length

  onpick(items[next].key)
}

const turn = (node: HTMLElement) => {
  const wheel = (e: WheelEvent) => {
    e.preventDefault()

    const now = performance.now()
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY

    if (now - last < SETTLE_MS) {
      carry = 0

      return
    }

    if (Math.sign(delta) !== Math.sign(carry) || now - moved > IDLE_MS) {
      carry = 0
    }

    carry += delta
    moved = now

    if (Math.abs(carry) >= NOTCH) {
      step(Math.sign(carry))
      carry = 0
      last = now
    }
  }

  node.addEventListener("wheel", wheel, { passive: false })

  return () => node.removeEventListener("wheel", wheel)
}

const keydown = (e: KeyboardEvent) => {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault()
    step(e.key === "ArrowUp" ? -1 : 1)
  }
}
</script>

<div
  class={[
    "relative h-full min-h-20 w-12 shrink-0 cursor-ns-resize overflow-hidden",
    "rounded-box border border-base-300 bg-raised outline-none",
    "focus-visible:border-primary",
  ]}
  role="listbox"
  tabindex="0"
  aria-label={label}
  aria-activedescendant="{uid}-{index}"
  title={current?.label ?? label}
  onkeydown={keydown}
  {@attach turn}
>
  <span
    class="pointer-events-none absolute inset-x-1.5 top-1/2 h-9 -translate-y-1/2 rounded-field bg-primary/12"
  ></span>
  <div
    class="absolute inset-x-0 top-1/2 transition-transform motion-reduce:transition-none"
    style:transform="translateY({-(index + 0.5) * 2.25}rem)"
  >
    {#each items as item, i (item.key)}
      <div
        id="{uid}-{i}"
        role="option"
        tabindex="-1"
        aria-selected={i === index}
        aria-label={item.label}
        class={[
          "mx-auto grid size-9 cursor-pointer place-items-center rounded-field transition-opacity",
          i === index ? "text-primary" : "opacity-35 hover:opacity-70",
        ]}
        onclick={() => onpick(item.key)}
        onkeydown={e => {
          if (e.key === "Enter" || e.key === " ") {
            onpick(item.key)
          }
        }}
      >
        <Icon icon={item.icon} class="size-5" />
      </div>
    {/each}
  </div>
</div>
