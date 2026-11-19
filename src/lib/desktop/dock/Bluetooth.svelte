<script lang="ts">
  import Icon from "@iconify/svelte"
  import MenuItem from "#lib/components/ui/MenuItem.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import { bluetoothDevices, type RadioState, radios, setRadio } from "#lib/desktop/native/quick.js"
  import { openUrl } from "#lib/desktop/native/system.js"
  import { m } from "#lib/paraglide/messages.js"
  import { dockAwake } from "./dock.svelte"
  import { radioError } from "./radio"

  let { compact = false, placement }: { compact?: boolean; placement: Placement } =
    $props()

  const POLL = 15_000

  let radio = $state<RadioState | null>(null)
  let devices = $state<string[]>([])
  let open = $state(false)
  let busy = $state(false)
  let error = $state("")

  const refresh = async () => {
    const list = await radios().catch(() => [])

    radio = list.find(r => r.kind === "bluetooth")?.state ?? null
    devices = radio === "on" ? await bluetoothDevices().catch(() => []) : []
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  $effect(() => {
    if (open) {
      error = ""
      refresh()
    }
  })

  const toggleRadio = async (on: boolean) => {
    busy = true
    error = ""

    await setRadio("bluetooth", on).catch((reason: unknown) => {
      error = String(reason)
    })

    await refresh()
    busy = false
  }

  const go = (url: string) => {
    open = false
    openUrl(url).catch(() => undefined)
  }

  const icon = $derived(
    radio !== "on"
      ? "lucide:bluetooth-off"
      : devices.length > 0
        ? "lucide:bluetooth-connected"
        : "lucide:bluetooth",
  )

  const title = $derived.by(() => {
    if (radio !== "on") {
      return m.dock_bluetooth_off()
    }

    return devices.length > 0 ? devices.join(", ") : m.dock_bluetooth_none()
  })
</script>

{#if radio !== null}
  <Popover label={m.dock_bluetooth()} {placement} width="w-72" bind:open>
    {#snippet trigger(p)}
      <button
        {...p}
        type="button"
        class={[
          "btn btn-ghost btn-square",
          compact ? "btn-xs" : "btn-sm",
          radio !== "on" && "text-base-content/50",
          open && "bg-primary/8 text-primary",
        ]}
        {title}
        aria-label={title}
      >
        <Icon {icon} class="size-4" />
      </button>
    {/snippet}

    <section class="flex flex-col gap-3 p-3 text-sm">
      <label class="flex cursor-pointer items-center justify-between gap-3">
        <span class="flex items-center gap-2 font-medium">
          <Icon {icon} class="size-4 text-base-content/70" />
          {m.dock_bluetooth()}
        </span>

        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          checked={radio === "on"}
          disabled={busy || radio === "disabled"}
          onchange={e => toggleRadio(e.currentTarget.checked)}
        />
      </label>

      {#if error}
        <p class="text-xs text-error" role="alert">{radioError(error)}</p>
      {/if}

      <div class="flex flex-col gap-1">
        <h3 class="text-xs font-medium text-base-content/60">
          {m.dock_bluetooth_connected()}
        </h3>

        {#if radio !== "on" || devices.length === 0}
          <p class="py-1 text-xs text-base-content/50">
            {radio !== "on" ? m.dock_bluetooth_off() : m.dock_bluetooth_none()}
          </p>
        {:else}
          <ul class="flex max-h-40 flex-col overflow-y-auto">
            {#each devices as name (name)}
              <li class="flex min-h-8 items-center gap-2 px-2">
                <Icon
                  icon="lucide:bluetooth-connected"
                  class="size-4 shrink-0 text-primary"
                />

                <span class="min-w-0 truncate" title={name}>{name}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="flex flex-col">
        <MenuItem
          icon="lucide:plus"
          label={m.dock_bluetooth_add()}
          onclick={() => go("ms-settings:connecteddevices")}
        />

        <MenuItem
          icon="lucide:settings-2"
          label={m.dock_bluetooth_settings()}
          onclick={() => go("ms-settings:bluetooth")}
        />
      </div>
    </section>
  </Popover>
{/if}
