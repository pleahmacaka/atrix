<script lang="ts">
  import Icon from "@iconify/svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Popover from "#lib/components/ui/Popover.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import {
    type BarId,
    canPlace,
    enabled,
    groupRemovable,
    type Target,
    ZONE_SIZES,
    ZONES,
  } from "#lib/desktop/dock/zones.ts"
  import type { ShellGroup, ShellZoneId, ShellZoneSize } from "#lib/desktop/settings/index.ts"
  import { m } from "#lib/paraglide/messages.js"
  import type { Editor } from "./editor.svelte"
  import ItemChip from "./ItemChip.svelte"
  import { SIZE_LABELS, ZONE_LABELS } from "./labels"

  let { editor, bar, id }: { editor: Editor; bar: BarId; id: ShellZoneId } = $props()

  let body = $state<HTMLElement>()

  const zone = $derived(editor.view[bar][id])

  const label = $derived(ZONE_LABELS[id]())

  const hint = $derived.by(() => {
    const hint = editor.hint

    return hint && hint !== "palette" && hint.bar === bar && hint.zone === id ? hint : null
  })

  const itemHint = $derived(hint && "group" in hint ? hint : null)

  const groupHint = $derived(hint && "at" in hint ? hint : null)

  const chipsOf = (group: ShellGroup) =>
    group.items.flatMap((entry, index) =>
      entry.kind === "separator" || enabled(entry.kind, editor.device) ? [{ entry, index }] : [],
    )

  const after = (box: DOMRect, x: number, y: number) =>
    y < box.top || (y <= box.bottom && x < box.left + box.width / 2)

  const inside = (box: DOMRect, x: number, y: number) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

  const targetAt = (node: HTMLElement, x: number, y: number): Target => {
    const groups = [...node.querySelectorAll<HTMLElement>(":scope > [data-group]")]

    for (const group of groups) {
      if (!inside(group.getBoundingClientRect(), x, y)) {
        continue
      }

      const at = Number(group.dataset.group)
      const next = [...group.querySelectorAll<HTMLElement>("[data-index]")].find(chip =>
        after(chip.getBoundingClientRect(), x, y),
      )

      return {
        bar,
        zone: id,
        group: at,
        index: next ? Number(next.dataset.index) : zone.groups[at].items.length,
      }
    }

    const at = groups.findIndex(group => after(group.getBoundingClientRect(), x, y))

    return { bar, zone: id, at: at < 0 ? groups.length : at }
  }

  const over = (e: DragEvent) => {
    const drag = editor.drag

    if (!drag || !body || !canPlace(drag.entry.kind, bar)) {
      return
    }

    e.preventDefault()

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move"
    }

    editor.hint = targetAt(body, e.clientX, e.clientY)
  }

  const leave = (e: DragEvent) => {
    if (!(e.relatedTarget instanceof Node && body?.contains(e.relatedTarget)) && hint) {
      editor.hint = null
    }
  }

  const ALIGNS = $derived(ZONES.map(value => ({ id: value, label: ZONE_LABELS[value]() })))

  const SIZES = $derived(
    ZONE_SIZES.map((value: ShellZoneSize) => ({ id: value, label: SIZE_LABELS[value]() })),
  )
</script>

<section class="flex min-w-0 flex-col gap-2 rounded-field bg-base-200 p-2">
  <header class="flex min-h-6 items-center gap-1 pl-1">
    <h4 class="min-w-0 flex-1 truncate text-xs font-medium text-base-content/60">{label}</h4>

    <IconButton
      icon="lucide:plus"
      label={m.dock_edit_add_group({ zone: label })}
      size="xs"
      onclick={() => editor.addGroup(bar, id)}
    />

    <Popover label={m.dock_edit_zone_options({ zone: label })} placement="bottom-end" width="w-80">
      {#snippet trigger(p)}
        <button
          {...p}
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.dock_edit_zone_options({ zone: label })}
          title={m.dock_edit_zone_options({ zone: label })}
        >
          <Icon icon="lucide:sliders-horizontal" class="size-4" />
        </button>
      {/snippet}

      <div class="flex flex-col gap-3 p-3 text-sm">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-base-content/60">{m.dock_edit_align()}</span>

          <Segmented
            items={ALIGNS}
            value={zone.align}
            label={m.dock_edit_align()}
            onpick={align => editor.setZone(bar, id, { align })}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-base-content/60">{m.dock_edit_size()}</span>

          <Segmented
            items={SIZES}
            value={zone.size}
            label={m.dock_edit_size()}
            onpick={size => editor.setZone(bar, id, { size })}
          />
        </div>
      </div>
    </Popover>
  </header>

  <ul
    bind:this={body}
    class={[
      "flex min-h-12 flex-wrap items-stretch gap-2 rounded-field",
      "p-1 transition-colors",
      groupHint && zone.groups.length === 0 && "bg-primary/8",
    ]}
    aria-label={label}
    ondragover={over}
    ondragleave={leave}
    ondrop={e => {
      e.preventDefault()
      editor.dropOn()
    }}
  >
    {#each zone.groups as group, at (group.id)}
      {@const chips = chipsOf(group)}
      {@const last = at === zone.groups.length - 1}

      <li
        data-group={at}
        class={[
          "relative flex min-h-10 min-w-16 flex-wrap items-center gap-1",
          "rounded-field",
          "border border-base-300 bg-base-100 p-1 transition-colors",
          itemHint?.group === at && chips.length === 0 && "border-primary bg-primary/8",
        ]}
      >
        {#if groupHint?.at === at || (last && groupHint?.at === at + 1)}
          <span
            class={[
              "pointer-events-none absolute -inset-y-1 w-0.5 rounded-full bg-primary",
              groupHint?.at === at ? "-left-1.5" : "-right-1.5",
            ]}
          ></span>
        {/if}

        {#each chips as chip, shown (chip.entry.id)}
          <div class="relative flex" data-index={chip.index}>
            {#if itemHint?.group === at && (itemHint.index === chip.index || (shown === chips.length - 1 && itemHint.index > chip.index))}
              <span
                class={[
                  "pointer-events-none absolute inset-y-0.5 z-10 w-0.5",
                  "rounded-full bg-primary",
                  itemHint.index === chip.index ? "-left-1" : "-right-1",
                ]}
              ></span>
            {/if}

            <ItemChip {editor} entry={chip.entry} />
          </div>
        {/each}

        {#if groupRemovable(zone, at)}
          <IconButton
            icon="lucide:x"
            label={m.dock_edit_remove_group()}
            size="xs"
            iconClass="size-3.5"
            class="text-base-content/50"
            onclick={() => editor.removeGroup(bar, id, at)}
          />
        {/if}
      </li>
    {/each}

    {#if zone.groups.length === 0}
      <li class="self-center px-2 text-xs text-base-content/50">{m.dock_edit_zone_empty()}</li>
    {/if}
  </ul>
</section>
