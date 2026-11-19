<script lang="ts">
  import Icon from "@iconify/svelte"
  import MenuItem from "#lib/components/ui/MenuItem.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import { type RadioState, radios, setRadio } from "#lib/desktop/native/quick.js"
  import { type NetworkInfo, openUrl, systemMeters } from "#lib/desktop/native/system.js"
  import { m } from "#lib/paraglide/messages.js"
  import { dockAwake } from "./dock.svelte"
  import { radioError } from "./radio"

  let { compact = false, placement }: { compact?: boolean; placement: Placement } =
    $props()

  const POLL = 10_000
  const SETTLE = 1_500

  const SIGNAL = [
    "lucide:wifi-zero",
    "lucide:wifi-low",
    "lucide:wifi-low",
    "lucide:wifi-high",
    "lucide:wifi",
  ]

  let network = $state<NetworkInfo | null>(null)
  let loaded = $state(false)
  let open = $state(false)
  let radio = $state<RadioState | null>(null)
  let busy = $state(false)
  let error = $state("")

  const refresh = async () => {
    const meters = await systemMeters().catch(() => null)

    network = meters?.network ?? null
    loaded = meters !== null
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  const readRadio = async () => {
    const list = await radios().catch(() => [])

    radio = list.find(r => r.kind === "wifi")?.state ?? null
  }

  $effect(() => {
    if (open) {
      error = ""
      readRadio()
    }
  })

  const toggleRadio = async (on: boolean) => {
    busy = true
    error = ""

    await setRadio("wifi", on).catch((reason: unknown) => {
      error = String(reason)
    })

    await readRadio()
    busy = false
    setTimeout(refresh, SETTLE)
  }

  const go = (url: string) => {
    open = false
    openUrl(url).catch(() => undefined)
  }

  const online = $derived(Boolean(network?.connected) && network?.kind !== "none")

  const name = $derived(network?.ssid || network?.name || m.dock_network_connected())

  const icon = $derived.by(() => {
    if (!network || !online) {
      return "lucide:wifi-off"
    }

    if (network.kind === "ethernet") {
      return "lucide:ethernet-port"
    }

    return SIGNAL[Math.max(0, Math.min(4, network.signal - 1))]
  })

  const title = $derived.by(() => {
    if (!network || !online) {
      return m.dock_network_none()
    }

    return network.kind === "wifi"
      ? m.dock_network_wifi_title({ name, bars: network.signal })
      : name
  })
</script>

{#if loaded}
  <Popover label={m.dock_network()} {placement} width="w-72" bind:open>
    {#snippet trigger(p)}
      <button
        {...p}
        type="button"
        class={[
          "btn btn-ghost btn-square",
          compact ? "btn-xs" : "btn-sm",
          !online && "text-base-content/50",
          open && "bg-primary/8 text-primary",
        ]}
        {title}
        aria-label={title}
      >
        <Icon {icon} class="size-4" />
      </button>
    {/snippet}

    <section class="flex flex-col gap-3 p-3 text-sm">
      <div class="flex items-center gap-3">
        <Icon {icon} class="size-5 shrink-0 text-base-content/70" />

        <div class="min-w-0 flex-1">
          <p class="truncate font-medium" title={online ? name : undefined}>
            {online ? name : m.dock_network_none()}
          </p>

          {#if online && network?.kind === "wifi"}
            <div class="flex items-end gap-0.5" aria-hidden="true">
              {#each [1, 2, 3, 4, 5] as bar (bar)}
                <span
                  class={[
                    "w-1 rounded-full",
                    bar <= network.signal ? "bg-primary" : "bg-base-300",
                  ]}
                  style:height="{bar * 0.15 + 0.15}rem"
                ></span>
              {/each}

              <span class="ml-1 text-xs text-base-content/60">
                {m.dock_network_signal({ bars: network.signal })}
              </span>
            </div>
          {:else if online}
            <p class="text-xs text-base-content/60">{m.dock_network_ethernet()}</p>
          {/if}
        </div>
      </div>

      {#if radio !== null}
        <label class="flex cursor-pointer items-center justify-between gap-3">
          <span>{m.dock_wifi()}</span>

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
      {/if}

      <div class="flex flex-col">
        <MenuItem
          icon="lucide:wifi"
          label={m.dock_network_available()}
          onclick={() => go("ms-availablenetworks:")}
        />

        <MenuItem
          icon="lucide:settings-2"
          label={m.dock_network_settings()}
          onclick={() => go("ms-settings:network")}
        />

        <MenuItem
          icon="lucide:plane"
          label={m.dock_airplane()}
          onclick={() => go("ms-settings:network-airplanemode")}
        />
      </div>
    </section>
  </Popover>
{/if}
