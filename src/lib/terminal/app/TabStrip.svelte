<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuAction } from "#lib/store/contextMenu.svelte.ts"
import { shellIcon } from "../shell-icons"
import {
  drag,
  justDragged,
  onTabDrop,
  pressTab,
  SLOP,
  springTo,
  unspring,
} from "./drag.svelte"
import { type Pane, panesOf } from "./layout"
import SerialDialog from "./SerialDialog.svelte"
import {
  closePane,
  closeTab,
  detachPane,
  moveTab,
  openTab,
  paneLabel,
  session,
  type Tab,
  ungroup,
} from "./tabs.svelte"

type Renaming = { kind: "tab" | "pane"; id: number }

let renaming = $state<Renaming | null>(null)

let picking = $state(false)

let connecting = $state(false)

let pulling = $state<number | null>(null)

let pullSlot = $state<number | null>(null)

let strip = $state<HTMLElement>()

let pulled = false

const rem = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

const groupName = (tab: Tab) => tab.name || m.terminal_group_name()

const isRenaming = (kind: Renaming["kind"], id: number) =>
  renaming?.kind === kind && renaming.id === id

const commitName = (value: string) => {
  const target = renaming

  renaming = null

  if (!target) {
    return
  }

  const name = value.trim() || undefined

  if (target.kind === "tab") {
    const tab = session.tabs.find(entry => entry.id === target.id)

    if (tab) {
      tab.name = name
    }

    return
  }

  for (const tab of session.tabs) {
    const pane = panesOf(tab.root).find(entry => entry.id === target.id)

    if (pane) {
      pane.name = name
    }
  }
}

const slots = () => [
  ...(strip?.querySelectorAll<HTMLElement>(":scope > [data-tab]") ?? []),
]

const slotAt = (x: number, y: number) => {
  const box = strip?.getBoundingClientRect()

  if (!box || x < box.left || x > box.right || y < box.top || y > box.bottom) {
    return null
  }

  const index = slots().findIndex(item => {
    const edge = item.getBoundingClientRect()

    return x < edge.left + edge.width / 2
  })

  return index < 0 ? session.tabs.length : index
}

const lineAt = (slot: number | null) => {
  const items = slots()
  const box = strip?.getBoundingClientRect()

  if (slot === null || !box || items.length === 0) {
    return null
  }

  const edge =
    slot < items.length
      ? items[slot].getBoundingClientRect().left
      : items[items.length - 1].getBoundingClientRect().right

  return (edge - box.left) / rem()
}

const tabSlot = $derived.by(() => {
  if (drag.tab === null) {
    return null
  }

  const slot = slotAt(drag.x, drag.y)
  const from = session.tabs.findIndex(tab => tab.id === drag.tab)

  if (from < 0) {
    return slot
  }

  return slot === null || slot === from || slot === from + 1 ? null : slot
})

const line = $derived(lineAt(tabSlot ?? pullSlot))

$effect(() =>
  onTabDrop(tab => {
    if (tabSlot === null) {
      return false
    }

    moveTab(tab, tabSlot)

    return true
  }),
)

const pressPane = (e: PointerEvent, pane: Pane) => {
  if (e.button !== 0) {
    return
  }

  const group = (e.currentTarget as HTMLElement).closest("[data-group]")
  const startX = e.clientX
  const startY = e.clientY

  const move = (p: PointerEvent) => {
    const far = Math.hypot(p.clientX - startX, p.clientY - startY) >= SLOP

    if (pulling === null && far) {
      pulling = pane.id
    }

    if (pulling === null) {
      return
    }

    const inside = group?.contains(
      document.elementFromPoint(p.clientX, p.clientY),
    )
    const home = session.tabs.findIndex(tab =>
      panesOf(tab.root).some(entry => entry.id === pane.id),
    )

    pullSlot = inside ? null : (slotAt(p.clientX, p.clientY) ?? home + 1)
  }

  const up = (u: PointerEvent) => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)

    if (pulling === null) {
      return
    }

    const slot = pullSlot
    const dropped = document.elementFromPoint(u.clientX, u.clientY)

    pulling = null
    pullSlot = null
    pulled = true
    setTimeout(() => {
      pulled = false
    })

    if (slot !== null && !group?.contains(dropped)) {
      detachPane(pane.id, slot)
    }
  }

  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
}

const renameItem = (target: Renaming): MenuAction => ({
  label: m.menu_rename(),
  icon: "lucide:pencil",
  run: () => {
    renaming = target
  },
})

const tabMenu = (tab: Tab, index: number) => [
  renameItem({ kind: "pane", id: panesOf(tab.root)[0].id }),
  "separator" as const,
  {
    label: m.terminal_tab_close(),
    icon: "lucide:x",
    run: () => closeTab(index),
  },
]

const groupMenu = (tab: Tab, index: number) => [
  renameItem({ kind: "tab", id: tab.id }),
  {
    label: m.terminal_group_ungroup(),
    icon: "lucide:ungroup",
    run: () => ungroup(tab),
  },
  "separator" as const,
  {
    label: m.terminal_tab_close(),
    icon: "lucide:x",
    run: () => closeTab(index),
  },
]

const paneMenu = (pane: Pane) => [
  {
    label: m.terminal_pane_detach(),
    icon: "lucide:square-arrow-out-up-right",
    run: () => detachPane(pane.id),
  },
  renameItem({ kind: "pane", id: pane.id }),
  "separator" as const,
  {
    label: m.terminal_pane_close(),
    icon: "lucide:x",
    run: () => closePane(pane.id),
  },
]

const openShell = (shell: string) => {
  picking = false
  openTab({ shell })
}
</script>

{#snippet nameField(value: string)}
  <input
    class="input input-xs h-6 w-full min-w-0 flex-1 px-1.5"
    aria-label={m.menu_rename()}
    spellcheck="false"
    {value}
    {@attach node => {
      node.focus()
      node.select()
    }}
    onclick={e => e.stopPropagation()}
    onpointerdown={e => e.stopPropagation()}
    ondblclick={e => e.stopPropagation()}
    onblur={e => commitName(e.currentTarget.value)}
    onkeydown={e => {
      if (e.key === "Enter") {
        e.currentTarget.blur()
      } else if (e.key === "Escape") {
        renaming = null
      }
    }}
  />
{/snippet}

{#snippet chip(pane: Pane, label: string, close: () => void, shown: boolean)}
  <Icon icon={shellIcon(pane.shell)} class="size-4 shrink-0" />
  {#if isRenaming("pane", pane.id)}
    {@render nameField(paneLabel(pane))}
  {:else}
    <span class="min-w-0 flex-1 truncate">{paneLabel(pane)}</span>
  {/if}
  <IconButton
    icon="lucide:x"
    {label}
    size="xs"
    iconClass="size-3.5"
    class={["shrink-0", !shown && "opacity-0 group-hover/tab:opacity-100"]}
    onclick={e => {
      e.stopPropagation()
      close()
    }}
  />
{/snippet}

<div
  bind:this={strip}
  role="tablist"
  aria-label={m.terminal_tabs()}
  class="relative flex h-full min-w-0 items-center gap-1 overflow-hidden"
>
  {#each session.tabs as tab, index (tab.id)}
    {@const active = index === session.active}
    {@const panes = panesOf(tab.root)}

    {#if panes.length === 1}
      {@const pane = panes[0]}
      <div
        data-tab
        role="tab"
        tabindex="-1"
        aria-selected={active}
        title={paneLabel(pane)}
        class={[
          "group/tab flex h-7 w-44 min-w-20 shrink cursor-pointer",
          "items-center gap-2",
          "rounded-field ps-2.5 pe-0.5 text-sm transition-colors duration-140",
          active
            ? "bg-primary/8 text-primary"
            : "text-base-content/70 hover:bg-base-content/8",
          drag.tab === tab.id && "opacity-50",
        ]}
        onpointerdown={e => pressTab(e, tab.id)}
        onpointerenter={() => springTo(tab.id, () => (session.active = index))}
        onpointerleave={unspring}
        onclick={() => {
          if (!justDragged()) {
            session.active = index
          }
        }}
        ondblclick={() => (renaming = { kind: "pane", id: pane.id })}
        oncontextmenu={e => contextMenu.show(e, tabMenu(tab, index))}
        onauxclick={e => e.button === 1 && closeTab(index)}
        onkeydown={() => undefined}
      >
        {@render chip(pane, m.terminal_tab_close(), () => closeTab(index), active)}
      </div>
    {:else}
      <fieldset
        data-tab
        data-group
        aria-label={m.terminal_group_label({ name: groupName(tab) })}
        class={[
          "flex h-8 min-w-0 shrink items-center gap-0.5 rounded-field p-0.5",
          "bg-base-content/5",
          drag.tab === tab.id && "opacity-50",
        ]}
        onpointerenter={() => springTo(tab.id, () => (session.active = index))}
        onpointerleave={unspring}
      >
        {#if isRenaming("tab", tab.id)}
          <div class="flex h-7 w-36 shrink-0 items-center px-0.5">
            {@render nameField(groupName(tab))}
          </div>
        {:else}
          <button
            type="button"
            title={groupName(tab)}
            class={[
              "flex h-7 max-w-32 shrink-0 cursor-pointer items-center gap-1.5",
              "rounded-field px-2 text-xs font-medium",
              "transition-colors duration-140 hover:bg-base-content/8",
              active ? "text-primary" : "text-base-content/60",
            ]}
            onpointerdown={e => pressTab(e, tab.id)}
            onclick={() => {
              if (!justDragged()) {
                session.active = index
              }
            }}
            ondblclick={() => (renaming = { kind: "tab", id: tab.id })}
            oncontextmenu={e => contextMenu.show(e, groupMenu(tab, index))}
          >
            <Icon icon="lucide:layout-grid" class="size-3.5 shrink-0" />
            <span class="truncate">{groupName(tab)}</span>
          </button>
        {/if}

        {#each panes as pane (pane.id)}
          {@const current = active && tab.focus === pane.id}
          <div
            role="tab"
            tabindex="-1"
            aria-selected={current}
            title={paneLabel(pane)}
            class={[
              "group/tab flex h-7 w-36 min-w-16 shrink cursor-pointer",
              "items-center gap-2",
              "rounded-field ps-2 pe-0.5 text-sm transition-colors duration-140",
              current
                ? "bg-primary/8 text-primary"
                : "text-base-content/70 hover:bg-base-content/8",
              pulling === pane.id && "opacity-50",
            ]}
            onpointerdown={e => pressPane(e, pane)}
            onclick={() => {
              if (!pulled) {
                session.active = index
                tab.focus = pane.id
              }
            }}
            ondblclick={() => (renaming = { kind: "pane", id: pane.id })}
            oncontextmenu={e => contextMenu.show(e, paneMenu(pane))}
            onauxclick={e => e.button === 1 && closePane(pane.id)}
            onkeydown={() => undefined}
          >
            {@render chip(pane, m.terminal_pane_close(), () => closePane(pane.id), current)}
          </div>
        {/each}
      </fieldset>
    {/if}
  {/each}

  {#if line !== null}
    <span
      class={[
        "pointer-events-none absolute inset-y-1.5 z-10 w-0.5 -translate-x-1/2",
        "rounded-full bg-primary transition-all duration-140",
      ]}
      style:left="{line}rem"
    ></span>
  {/if}
</div>

<div class="flex shrink-0 items-center gap-0.5">
  <IconButton
    icon="lucide:plus"
    label={m.terminal_tab_new()}
    onclick={() => openTab()}
  />
  <Popover
    label={m.terminal_shells()}
    placement="bottom-start"
    width="w-60"
    bind:open={picking}
  >
    {#snippet trigger(p)}
      <button
        {...p}
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.terminal_shells()}
        title={m.terminal_shells()}
      >
        <Icon icon="lucide:chevron-down" class="size-4" />
      </button>
    {/snippet}
    <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
      {#each session.shells as shell (shell.id)}
        <MenuItem
          icon={shellIcon(shell.id)}
          label={shell.name}
          onclick={() => openShell(shell.id)}
        />
      {/each}
      <Separator />
      <MenuItem
        icon="lucide:usb"
        label={m.terminal_serial_open()}
        onclick={() => {
          picking = false
          connecting = true
        }}
      />
    </div>
  </Popover>
</div>

<SerialDialog bind:open={connecting} onconnect={openShell} />
