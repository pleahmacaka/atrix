<script lang="ts">
  import type { DockEdge, DockStyle } from "@atrix/settings"
  import Icon from "@iconify/svelte"
  import type { Snippet } from "svelte"
  import Popover from "#lib/components/ui/Popover.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import Stepper from "#lib/components/ui/Stepper.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import type { Editor } from "./editor.svelte"

  let { editor }: { editor: Editor } = $props()

  const HEIGHT = { min: 32, max: 96, step: 4, base: 48 }
  const ICON = { min: 16, max: 48, step: 4, base: 24 }
  const WIDTH = { min: 320, max: 1400, step: 40, base: 720 }

  const device = $derived(editor.device)

  const edges = $derived<{ id: DockEdge; label: string }[]>([
    { id: "bottom", label: m.dock_edit_edge_bottom() },
    { id: "top", label: m.dock_edit_edge_top() },
  ])

  const styles = $derived<{ id: DockStyle; label: string }[]>([
    { id: "windows", label: m.dock_edit_style_bar() },
    { id: "mac", label: m.dock_edit_style_floating() },
  ])
</script>

{#snippet row(title: string, control: Snippet)}
  <div class="flex min-h-9 items-center justify-between gap-4">
    <span class="min-w-0 truncate">{title}</span>
    {@render control()}
  </div>
{/snippet}

<Popover label={m.dock_edit_dock_options()} placement="bottom-end" width="w-96">
  {#snippet trigger(p)}
    <button {...p} type="button" class="btn btn-ghost btn-sm gap-1.5">
      <Icon icon="lucide:sliders-horizontal" class="size-4" />
      {m.dock_edit_dock_options()}
    </button>
  {/snippet}

  <div class="flex flex-col gap-1 p-3 text-sm">
    {#snippet edge()}
      <Segmented
        items={edges}
        value={device.dockEdge}
        label={m.dock_edit_edge()}
        onpick={dockEdge => editor.commit({ dockEdge })}
      />
    {/snippet}

    {#snippet style()}
      <Segmented
        items={styles}
        value={device.dockStyle}
        label={m.dock_edit_style()}
        onpick={dockStyle => editor.commit({ dockStyle })}
      />
    {/snippet}

    {#snippet height()}
      <Stepper
        label={m.dock_edit_height()}
        value={device.dockHeight}
        range={HEIGHT}
        onchange={dockHeight => editor.commit({ dockHeight })}
      />
    {/snippet}

    {#snippet icons()}
      <Stepper
        label={m.dock_edit_icon_size()}
        value={device.dockIconSize}
        range={ICON}
        onchange={dockIconSize => editor.commit({ dockIconSize })}
      />
    {/snippet}

    {#snippet width()}
      <Stepper
        label={m.dock_edit_width()}
        value={device.dockWidth}
        range={WIDTH}
        onchange={dockWidth => editor.commit({ dockWidth })}
      />
    {/snippet}

    {#snippet islands()}
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        aria-label={m.dock_edit_islands()}
        checked={device.dockIslands}
        onchange={e => editor.commit({ dockIslands: e.currentTarget.checked })}
      />
    {/snippet}

    {@render row(m.dock_edit_edge(), edge)}
    {@render row(m.dock_edit_style(), style)}
    {@render row(m.dock_edit_height(), height)}
    {@render row(m.dock_edit_icon_size(), icons)}

    {#if device.dockStyle === "mac"}
      {@render row(m.dock_edit_width(), width)}
    {/if}

    {@render row(m.dock_edit_islands(), islands)}
  </div>
</Popover>
