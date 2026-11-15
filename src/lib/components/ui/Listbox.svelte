<script module lang="ts">
export type ListGroup<T> = { name: string; items: T[] }
</script>

<script lang="ts" generics="T">
import type { Snippet } from "svelte"
import type { HTMLAttributes } from "svelte/elements"
import { m } from "#lib/paraglide/messages.js"
import { popoverMotion, popoverSheet, reveal } from "./popover.ts"

const PAGE = 8

let {
  id,
  label,
  anchor,
  groups,
  active = $bindable(-1),
  open,
  sheet = false,
  up = false,
  selected,
  disabled,
  title,
  onpick,
  onbeforetoggle,
  option,
  header,
  footer,
  ...rest
}: {
  id: string
  label: string
  anchor: string
  groups: ListGroup<T>[]
  active?: number
  open?: boolean
  sheet?: boolean
  up?: boolean
  selected?: (item: T) => boolean
  disabled?: (item: T) => boolean
  title?: (item: T) => string
  onpick: (item: T) => void
  onbeforetoggle?: (e: ToggleEvent) => void
  option: Snippet<[T]>
  header?: Snippet
  footer?: Snippet
} & Omit<HTMLAttributes<HTMLDivElement>, "id" | "title" | "onbeforetoggle"> =
  $props()

let shown = $state(false)

const rows = $derived.by(() => {
  let index = 0

  return groups.map(g => ({
    name: g.name,
    items: g.items.map(item => ({ item, index: index++ })),
  }))
})

const flat = $derived(groups.flatMap(g => g.items))

export const move = (to: number, dir: 1 | -1) => {
  const start = Math.max(0, Math.min(to, flat.length - 1))

  for (const step of [dir, -dir]) {
    for (let i = start; i >= 0 && i < flat.length; i += step) {
      if (!disabled?.(flat[i])) {
        active = i
        reveal(document.getElementById(`${id}-${i}`))

        return
      }
    }
  }

  active = -1
}

const pick = (item: T) => {
  if (!disabled?.(item)) {
    onpick(item)
  }
}

export const navigate = (e: KeyboardEvent) => {
  const keys: Record<string, () => void> = {
    ArrowDown: () => move(active + 1, 1),
    ArrowUp: () => move(active < 0 ? flat.length - 1 : active - 1, -1),
    Home: () => move(0, 1),
    End: () => move(flat.length - 1, -1),
    PageDown: () => move(active + PAGE, 1),
    PageUp: () => move(active - PAGE, -1),
  }

  if (active >= 0 && active < flat.length) {
    keys.Enter = () => pick(flat[active])
  }

  if (e.isComposing || !keys[e.key]) {
    return false
  }

  e.preventDefault()
  e.stopPropagation()
  keys[e.key]()

  return true
}

const ROOM = 160

let above = $state(false)

const placeFor = (e: ToggleEvent) => {
  const trigger = document.querySelector(`[popovertarget="${id}-pop"]`)

  if (e.newState !== "open" || !(trigger instanceof HTMLElement)) {
    return
  }

  const rect = trigger.getBoundingClientRect()
  const below = innerHeight - rect.bottom

  above = below < ROOM && rect.top > below
}

const toggle = (e: ToggleEvent) => {
  shown ||= e.newState === "open"
  placeFor(e)
  onbeforetoggle?.(e)
}
</script>

<div
  {...rest}
  id={`${id}-pop`}
  popover={open === undefined ? "auto" : "manual"}
  style:position-anchor={anchor}
  class={[
    (above || up) && "above",
    "anchored popover-box nowheel fixed inset-auto mx-0 my-1 flex w-max max-w-sm",
    "flex-col overflow-hidden p-0 text-base-content",
    popoverMotion,
    sheet && ["sheet", popoverSheet],
  ]}
  onbeforetoggle={toggle}
  {@attach open !== undefined &&
    (node => {
      if (open) {
        node.showPopover()

        return () => node.hidePopover()
      }
    })}
>
  {#if shown}
    {@render header?.()}

    <div
      id={`${id}-list`}
      role="listbox"
      aria-label={label}
      tabindex="-1"
      class="min-h-0 overflow-y-auto bg-inherit px-1 pb-1"
      onpointerdown={e => e.preventDefault()}
    >
      {#each rows as row (row.name)}
        <fieldset
          aria-label={row.name || undefined}
          class={["min-w-0 bg-inherit", !row.name && "pt-1"]}
        >
          {#if row.name}
            <div
              class={[
                "sticky top-0 z-10 truncate bg-inherit px-2 pt-2 pb-1",
                "text-xs font-medium text-base-content/50",
              ]}
              title={row.name}
              aria-hidden="true"
            >
              {row.name}
            </div>
          {/if}
          {#each row.items as { item, index } (index)}
            {@const off = !!disabled?.(item)}
            <div
              id={`${id}-${index}`}
              role="option"
              tabindex="-1"
              aria-selected={selected ? selected(item) : active === index}
              aria-disabled={off}
              title={title?.(item)}
              class={[
                "flex min-h-8 scroll-mt-8 items-center gap-2 rounded-field px-2 py-1 text-sm",
                "max-sm:min-h-12 max-sm:px-3 max-sm:text-base",
                off ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                active === index && "bg-base-content/10",
              ]}
              onclick={() => pick(item)}
              onkeydown={navigate}
              onpointermove={() => {
                if (!off) {
                  active = index
                }
              }}
            >
              {@render option(item)}
            </div>
          {/each}
        </fieldset>
      {:else}
        <p class="px-2 py-6 text-center text-sm text-base-content/50">{m.common_no_results()}</p>
      {/each}
    </div>

    {@render footer?.()}
  {/if}
</div>

<style>
  .anchored {
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-inline;
    min-width: anchor-size(width);
    max-height: min(20rem, 100%);
  }

  .anchored.above {
    position-area: block-start span-inline-end;
  }

  @media (width < 40rem) {
    .anchored {
      max-height: min(28rem, 100%);
    }

    .sheet {
      position-area: none;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
