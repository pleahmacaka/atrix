<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { fade } from "svelte/transition"

type Item = {
  key: string
  icon: string
  label: string
  group: string
  badge?: string
}

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

const SLOT_REM = 2.5

let open = $state(false)

let pos = $state(0)

const wrap = (n: number) => ((n % items.length) + items.length) % items.length

$effect(() => {
  const target = index
  const count = items.length

  if (count === 0) {
    return
  }

  untrack(() => {
    let delta = target - wrap(pos)

    if (delta > count / 2) {
      delta -= count
    } else if (delta < -count / 2) {
      delta += count
    }

    pos += delta
  })
})

const slots = $derived(
  items.length === 0
    ? []
    : (open && items.length > 1 ? [-2, -1, 0, 1, 2] : [0]).map(offset => ({
        offset,
        key: pos + offset,
        item: items[wrap(pos + offset)],
      })),
)

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

const closeOutside = (node: HTMLElement) => {
  const down = (e: PointerEvent) => {
    if (!(e.target instanceof Node && node.contains(e.target))) {
      open = false
    }
  }
  const blur = () => {
    open = false
  }

  window.addEventListener("pointerdown", down)
  window.addEventListener("blur", blur)

  return () => {
    window.removeEventListener("pointerdown", down)
    window.removeEventListener("blur", blur)
  }
}

const keydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    open = false
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault()
    open = !open
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault()
    step(e.key === "ArrowUp" ? -1 : 1)
  }
}
</script>

<div class="relative size-full">
  <div
    class={[
      "absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden",
      "rounded-full border bg-raised outline-none transition-height-shadow",
      "motion-reduce:transition-none",
      open
        ? "z-20 cursor-ns-resize border-primary shadow-lg"
        : "h-full cursor-pointer border-base-300 focus-visible:border-primary",
    ]}
    style:height={open ? `calc(100% + ${SLOT_REM * 2 - 0.5}rem)` : undefined}
    role="listbox"
    tabindex="0"
    aria-label={label}
    aria-expanded={open}
    aria-activedescendant="{uid}-{index}"
    title={current?.label ?? label}
    onkeydown={keydown}
    onclick={() => {
      if (!open) {
        open = true
      }
    }}
    onfocusout={e => {
      if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
        open = false
      }
    }}
    {@attach turn}
    {@attach closeOutside}
  >
    {#if open}
      <span
        class="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-1/2 rounded-full bg-primary/12"
      ></span>
    {/if}
    <div class={["absolute inset-0", open && "fade-y"]}>
      {#each slots as slot (slot.key)}
        <div
          id={slot.offset === 0 ? `${uid}-${index}` : undefined}
          role="option"
          tabindex="-1"
          aria-selected={slot.offset === 0}
          aria-label={slot.item.label}
          class={[
            "absolute left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer",
            "place-items-center rounded-full transition-top-opacity duration-200",
            "motion-reduce:transition-none",
            slot.offset === 0 ? "text-primary" : "opacity-45 hover:opacity-80",
          ]}
          style:top="calc(50% + {slot.offset * SLOT_REM}rem)"
          transition:fade={{ duration: 120 }}
          onclick={e => {
            if (open) {
              e.stopPropagation()
              onpick(slot.item.key)
              open = false
            }
          }}
          onkeydown={e => {
            if (e.key === "Enter" || e.key === " ") {
              onpick(slot.item.key)
              open = false
            }
          }}
        >
          <Icon
            icon={slot.item.icon}
            class={[
              "transition-size",
              slot.offset === 0 && !open ? "size-3/5" : "size-5",
            ]}
          />
          {#if slot.item.badge}
            <span
              class="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded-full bg-base-300"
              title={slot.item.badge}
            >
              <Icon icon="lucide:plug" class="size-2.5" />
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
