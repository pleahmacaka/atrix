<script lang="ts">
import Icon from "@iconify/svelte"
import { tick } from "svelte"
import { contextMenu, type MenuAction } from "#lib/store/contextMenu.svelte.ts"

const REM = 16

let menu = $state<HTMLDivElement>()

let left = $state(0)

let top = $state(0)

let armed = $state<MenuAction | null>(null)

const place = async () => {
  const open = contextMenu.current

  if (!open) {
    return
  }

  armed = null
  left = open.x
  top = open.y
  await tick()

  const rect = menu?.getBoundingClientRect()

  if (rect) {
    left = Math.max(4, Math.min(open.x, innerWidth - rect.width - 4))
    top = Math.max(4, Math.min(open.y, innerHeight - rect.height - 4))
  }

  menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
}

$effect(() => {
  if (contextMenu.current) {
    menu?.showPopover()
    place()
  } else {
    menu?.hidePopover()
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

const move = (e: KeyboardEvent) => {
  const buttons = [
    ...(menu?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
  ]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault()

    const step = e.key === "ArrowDown" ? 1 : -1

    buttons[(at + step + buttons.length) % buttons.length]?.focus()
  } else if (e.key === "Escape") {
    e.preventDefault()
    contextMenu.close()
  }
}
</script>

<svelte:window
  onpointerdown={e => {
    if (contextMenu.current && !menu?.contains(e.target as Node)) {
      contextMenu.close()
    }
  }}
  onresize={contextMenu.close}
  onblur={contextMenu.close}
/>

<div
  bind:this={menu}
  popover="manual"
  role="menu"
  tabindex="-1"
  class={[
    "popover-box fixed inset-auto m-0 hidden min-w-52 flex-col p-1 text-sm",
    "text-base-content open:flex",
  ]}
  style:left="{left / REM}rem"
  style:top="{top / REM}rem"
  onkeydown={move}
>
  {#each contextMenu.current?.items ?? [] as item, index (index)}
    {#if item === "separator"}
      <hr class="my-1 border-base-content/10" />
    {:else}
      <button
        type="button"
        role="menuitem"
        class={[
          "flex min-h-8 cursor-pointer items-center gap-2 rounded-field px-2 text-left",
          "hover:bg-base-content/10 focus-visible:bg-base-content/10 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-40",
          item.danger && "text-error",
          armed === item && "bg-error/15",
        ]}
        disabled={item.disabled}
        onclick={() => run(item)}
      >
        <Icon icon={item.icon ?? "lucide:dot"} class="size-4 shrink-0 opacity-70" />
        <span class="flex-1">{armed === item ? item.confirm : item.label}</span>
        {#if item.hint}
          <kbd class="kbd kbd-xs opacity-60">{item.hint}</kbd>
        {/if}
      </button>
    {/if}
  {/each}
</div>
