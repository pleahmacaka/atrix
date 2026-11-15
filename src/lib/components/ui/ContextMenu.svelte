<script lang="ts">
import { tick } from "svelte"
import {
  contextMenu,
  type MenuItem as Item,
  type MenuAction,
} from "#lib/store/contextMenu.svelte.ts"
import MenuItem from "./MenuItem.svelte"
import { menuKeys } from "./menu.ts"
import { popoverMotion } from "./popover.ts"

const REM = 16

let home = $state<HTMLDivElement>()

let menu = $state<HTMLDivElement>()

let left = $state(0)

let top = $state(0)

let armed = $state<MenuAction | null>(null)

let items = $state<Item[]>([])

const place = async () => {
  const open = contextMenu.current

  if (!open) {
    return
  }

  armed = null
  items = open.items
  left = open.x
  top = open.y
  await tick()

  if (menu) {
    const width = menu.offsetWidth
    const height = menu.offsetHeight

    left = Math.max(4, Math.min(open.x, innerWidth - width - 4))
    top = Math.max(4, open.y + height + 4 > innerHeight ? open.y - height : open.y)
  }

  menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
}

const hostOf = () => [...document.querySelectorAll("dialog:modal")].at(-1) ?? home

$effect(() => {
  if (!menu || !home) {
    return
  }

  if (contextMenu.current) {
    const host = hostOf()

    if (menu.matches(":popover-open")) {
      menu.hidePopover()
    }

    // a modal dialog makes everything outside it inert, so the menu has to live inside it
    if (host && menu.parentNode !== host) {
      host.append(menu)
    }

    menu.showPopover()
    place()
  } else {
    if (menu.matches(":popover-open")) {
      menu.hidePopover()
    }

    if (menu.parentNode !== home) {
      home.append(menu)
    }
  }
})

const run = async (action: MenuAction) => {
  if (action.confirm && armed !== action) {
    armed = action

    return
  }

  contextMenu.close()
  await action.run()
}

const close = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault()
    e.stopPropagation()
    contextMenu.close()
  }
}
</script>

<svelte:window
  onpointerdown={e => {
    if (contextMenu.current && !(e.target instanceof Node && menu?.contains(e.target))) {
      contextMenu.close()
    }
  }}
  onresize={contextMenu.close}
  onblur={contextMenu.close}
/>

<div bind:this={home} class="contents">
<div
  bind:this={menu}
  popover="manual"
  role="menu"
  tabindex="-1"
  class={[
    "popover-box fixed inset-auto m-0 hidden min-w-52 max-w-xs flex-col p-1 text-sm",
    "text-base-content open:flex",
    popoverMotion,
  ]}
  style:left="{left / REM}rem"
  style:top="{top / REM}rem"
  onkeydown={close}
  {@attach menuKeys}
>
  {#each items as item, index (index)}
    {#if item === "separator"}
      <hr class="my-1 border-0" />
    {:else}
      <MenuItem
        icon={item.icon ?? "lucide:dot"}
        label={armed === item && item.confirm ? item.confirm : item.label}
        hint={item.hint}
        danger={item.danger}
        disabled={item.disabled}
        class={armed === item ? "bg-error/12" : undefined}
        onclick={() => run(item)}
      />
    {/if}
  {/each}
</div>
</div>
