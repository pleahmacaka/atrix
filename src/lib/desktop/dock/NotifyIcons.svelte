<script lang="ts">
  import Icon from "@iconify/svelte"
  import { flip } from "svelte/animate"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import {
    notifyIconClick,
    notifyIconPromote,
    notifyIcons,
    onTrayIcons,
    type TrayIcon,
  } from "#lib/desktop/native/tray.js"
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

  type Props = {
    compact?: boolean
    edge?: "top" | "bottom"
    placement: Placement
    order?: string[]
    hidden?: string[]
    onreorder?: (order: string[]) => void
    onhide?: (hidden: string[]) => void
  }

  let {
    compact = false,
    edge = "bottom",
    placement,
    order = [],
    hidden = [],
    onreorder,
    onhide,
  }: Props = $props()

  const TRAY_ICON = "application/x-atrix-tray-icon"

  let icons = $state<TrayIcon[]>([])
  let stashOpen = $state(false)
  let showAll = $state(false)
  let dragId = $state<string | null>(null)
  let dragStashed = $state(false)
  let dropId = $state<string | null>(null)
  let dropBefore = $state(true)
  let demoting = $state(false)

  const refresh = async () => {
    icons = await notifyIcons().catch(() => icons)
  }

  $effect(() => {
    refresh()

    const stop = onTrayIcons(refresh)

    return () => {
      stop.then(off => off()).catch(() => undefined)
    }
  })

  const sorted = $derived.by(() => {
    const rank = new Map(order.map((id, index) => [id, index]))

    return [...icons].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  })

  const hiddenSet = $derived(new Set(hidden))

  const shown = $derived(sorted.filter(icon => icon.promoted))

  const overflow = $derived(sorted.filter(icon => !icon.promoted))

  const stashed = $derived(overflow.filter(icon => showAll || !hiddenSet.has(icon.id)))

  const hiddenCount = $derived(overflow.filter(icon => hiddenSet.has(icon.id)).length)

  const click = (id: string, button: "left" | "right") => {
    notifyIconClick(id, button).catch(() => undefined)
  }

  const setHidden = (id: string, next: boolean) => {
    const rest = hidden.filter(found => found !== id)

    onhide?.(next ? [...rest, id] : rest)
  }

  const promote = async (id: string, next: boolean) => {
    await notifyIconPromote(id, next).catch(() => undefined)
    await refresh()

    if (next && hidden.includes(id)) {
      setHidden(id, false)
    }

    if (overflow.length === 0) {
      stashOpen = false
    }
  }

  const endDrag = () => {
    dragId = null
    dropId = null
    dragStashed = false
    demoting = false
  }

  const dragOver = (e: DragEvent, id: string) => {
    if (!dragId) {
      return
    }

    e.preventDefault()

    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()

    dropId = id
    dropBefore = e.clientX < box.left + box.width / 2
  }

  const reorder = (from: string, onto: string, before: boolean) => {
    const ids = sorted.map(icon => icon.id).filter(id => id !== from)
    const at = ids.indexOf(onto)

    if (at < 0) {
      return
    }

    ids.splice(before ? at : at + 1, 0, from)
    onreorder?.(ids)
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const from = dragId
    const onto = dropId
    const before = dropBefore
    const wasStashed = dragStashed

    endDrag()

    if (!from) {
      return
    }

    if (onto && onto !== from) {
      reorder(from, onto, before)
    }

    if (wasStashed) {
      void promote(from, true)
    }
  }

  const demote = (e: DragEvent) => {
    e.preventDefault()

    const from = dragId

    if (from && !dragStashed) {
      void promote(from, false)
    }

    endDrag()
  }

  const iconMenu = (e: MouseEvent, icon: TrayIcon) => {
    if (!e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      click(icon.id, "right")

      return
    }

    const off = hiddenSet.has(icon.id)

    contextMenu.show(e, [
      icon.promoted || !off
        ? {
            label: m.dock_tray_hide(),
            icon: "lucide:eye-off",
            run: () => {
              void notifyIconPromote(icon.id, false).catch(() => undefined)
              setHidden(icon.id, true)
            },
          }
        : {
            label: m.dock_tray_show(),
            icon: "lucide:eye",
            run: () => promote(icon.id, true),
          },
    ])
  }
</script>

{#snippet trayButton(icon: TrayIcon, size: "xs" | "sm")}
  <button
    type="button"
    class={["btn btn-ghost btn-square", size === "xs" ? "btn-xs" : "btn-sm"]}
    title={icon.tooltip}
    aria-label={icon.tooltip || m.dock_tray_icon()}
    draggable="true"
    ondragstart={e => {
      e.dataTransfer?.setData("text/plain", icon.id)
      e.dataTransfer?.setData(TRAY_ICON, icon.id)
      dragId = icon.id
      dragStashed = !icon.promoted
    }}
    ondragend={endDrag}
    onclick={() => {
      click(icon.id, "left")
      stashOpen = false
    }}
    oncontextmenu={e => iconMenu(e, icon)}
  >
    {#if icon.icon}
      <img src={icon.icon} alt="" class="size-4" draggable="false" />
    {:else}
      <span class="size-2 rounded-full bg-base-content/40"></span>
    {/if}
  </button>
{/snippet}

{#if icons.length > 0}
  <fieldset
    class="flex items-center gap-0.5"
    aria-label={m.dock_tray()}
    ondragover={e => {
      if (dragId && dragStashed) {
        e.preventDefault()
      }
    }}
    ondrop={drop}
  >
    {#if overflow.length > 0}
      <Popover label={m.dock_tray_hidden()} {placement} bind:open={stashOpen}>
        {#snippet trigger(p)}
          <button
            {...p}
            type="button"
            class={[
              "btn btn-ghost btn-square",
              compact ? "btn-xs" : "btn-sm",
              (stashOpen || demoting) && "bg-primary/8 text-primary",
            ]}
            title={m.dock_tray_hidden_count({ count: overflow.length })}
            aria-label={m.dock_tray_hidden()}
            ondragover={e => {
              if (dragId && !dragStashed) {
                e.preventDefault()
                demoting = true
              }
            }}
            ondragleave={() => (demoting = false)}
            ondrop={demote}
          >
            <Icon
              icon={edge === "top" ? "lucide:chevron-down" : "lucide:chevron-up"}
              class="size-4"
            />
          </button>
        {/snippet}

        <fieldset
          class="flex flex-col gap-2 p-2"
          aria-label={m.dock_tray_hidden()}
          ondragover={e => {
            if (dragId && !dragStashed) {
              e.preventDefault()
            }
          }}
          ondrop={demote}
        >
          {#if stashed.length > 0}
            <ul class="grid grid-cols-6 gap-0.5">
              {#each stashed as icon (icon.id)}
                {@const off = hiddenSet.has(icon.id)}

                <li class={["relative", off && "opacity-40"]}>
                  {@render trayButton(icon, "sm")}

                  {#if showAll}
                    <button
                      type="button"
                      class={[
                        "absolute -top-1 -right-1 flex size-4 cursor-pointer items-center",
                        "justify-center rounded-full bg-base-300 hover:bg-base-content/20",
                      ]}
                      title={off ? m.dock_tray_overflow_show() : m.dock_tray_overflow_hide()}
                      aria-label={off ? m.dock_tray_overflow_show() : m.dock_tray_overflow_hide()}
                      onclick={e => {
                        e.stopPropagation()
                        setHidden(icon.id, !off)
                      }}
                    >
                      <Icon icon={off ? "lucide:eye" : "lucide:eye-off"} class="size-2.5" />
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="px-2 py-2 text-center text-xs text-base-content/50">
              {m.dock_tray_all_hidden({ count: hiddenCount })}
            </p>
          {/if}

          <label
            class={[
              "flex min-w-40 cursor-pointer items-center justify-between gap-3",
              "px-1 text-xs text-base-content/70",
            ]}
          >
            <span>{m.dock_tray_show_all()}</span>

            <input type="checkbox" class="toggle toggle-primary toggle-xs" bind:checked={showAll} />
          </label>
        </fieldset>
      </Popover>
    {/if}

    <ul class="flex items-center gap-0.5">
      {#each shown as icon (icon.id)}
        <li
          animate:flip={{ duration: 120 }}
          class={["relative flex transition-opacity", dragId === icon.id && "opacity-30"]}
          ondragover={e => dragOver(e, icon.id)}
          ondrop={drop}
        >
          {#if dropId === icon.id}
            <span
              class={[
                "pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-primary",
                dropBefore ? "-left-0.5" : "-right-0.5",
              ]}
            ></span>
          {/if}

          {@render trayButton(icon, compact ? "xs" : "sm")}
        </li>
      {/each}
    </ul>
  </fieldset>
{/if}
