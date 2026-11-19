<script lang="ts">
  import Icon from "@iconify/svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import { type Meters, runCommand, systemMeters } from "#lib/desktop/native/system.js"
  import { m } from "#lib/paraglide/messages.js"
  import { dockAwake } from "./dock.svelte"

  type Props = {
    stacked?: boolean
    compact?: boolean
    placement: Placement
  }

  let { stacked = false, compact = false, placement }: Props = $props()

  const POLL = 3_000
  const DOUBLE_CLICK = 250

  let meters = $state<Meters | null>(null)
  let open = $state(false)
  let openAtPress = false
  let clickTimer: ReturnType<typeof setTimeout> | undefined

  const refresh = async () => {
    meters = await systemMeters().catch(() => null)
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  const onclick = () => {
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      open = !openAtPress
    }, DOUBLE_CLICK)
  }

  const ondblclick = () => {
    clearTimeout(clickTimer)
    open = false
    runCommand("taskmgr").catch(() => undefined)
  }

  $effect(() => () => clearTimeout(clickTimer))

  const percent = (ratio: number) => Math.round(ratio * 100)

  const gb = (mb: number) => (mb / 1024).toFixed(1)

  const cpu = $derived(percent(meters?.cpu ?? 0))

  const ram = $derived(percent(meters?.memory ?? 0))

  const memory = $derived(
    meters
      ? m.dock_memory_of({
          used: gb(meters.memoryUsedMb),
          total: gb(meters.memoryTotalMb),
        })
      : "",
  )

  const summary = $derived(m.dock_meters_summary({ cpu, memory: ram }))
</script>

{#if meters}
  <Popover label={m.dock_meters()} {placement} width="w-64" bind:open>
    {#snippet trigger(p)}
      <button
        {...p}
        popovertarget={null}
        type="button"
        class={[
          "btn btn-ghost gap-1.5 px-1.5 font-normal tabular-nums",
          compact ? "btn-xs" : "btn-sm",
          open && "bg-primary/8 text-primary",
        ]}
        title={summary}
        aria-label={m.dock_meters()}
        onpointerdown={() => (openAtPress = open)}
        {onclick}
        {ondblclick}
      >
        <Icon icon="lucide:cpu" class="size-4 shrink-0" />

        {#if !compact || stacked}
          <span
            class={[
              "flex text-xs",
              stacked ? "flex-col items-start leading-none" : "gap-2",
            ]}
          >
            <span class="whitespace-nowrap">
              {m.dock_cpu_value({ percent: cpu })}
            </span>

            <span class="whitespace-nowrap">
              {m.dock_memory_value({ percent: ram })}
            </span>
          </span>
        {/if}
      </button>
    {/snippet}

    <section class="flex flex-col gap-3 p-3 text-sm">
      <h3 class="text-xs font-medium text-base-content/60">{m.dock_meters()}</h3>

      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <span>{m.dock_cpu()}</span>

          <span class="text-xs tabular-nums">{cpu}%</span>
        </div>

        <progress
          class="progress progress-primary h-1.5"
          value={cpu}
          max="100"
        ></progress>
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <span>{m.dock_memory()}</span>

          <span class="text-xs tabular-nums">{ram}%</span>
        </div>

        <progress
          class="progress progress-primary h-1.5"
          value={ram}
          max="100"
        ></progress>

        <span class="text-xs tabular-nums text-base-content/60">{memory}</span>
      </div>

      <button
        type="button"
        class="btn btn-sm"
        onclick={() => {
          open = false
          runCommand("taskmgr").catch(() => undefined)
        }}
      >
        <Icon icon="lucide:activity" class="size-4" />
        {m.dock_task_manager()}
      </button>
    </section>
  </Popover>
{/if}
