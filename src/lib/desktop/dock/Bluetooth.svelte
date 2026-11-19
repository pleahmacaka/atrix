<script lang="ts">
  import Icon from "@iconify/svelte"
  import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import MenuItem from "#lib/components/ui/MenuItem.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import {
    type BluetoothDevice,
    bluetoothConnect,
    bluetoothDevices,
    bluetoothUnpair,
  } from "#lib/desktop/native/bluetooth.js"
  import { type RadioState, radios, setRadio } from "#lib/desktop/native/quick.js"
  import { openUrl } from "#lib/desktop/native/system.js"
  import { m } from "#lib/paraglide/messages.js"
  import BluetoothAdd from "./BluetoothAdd.svelte"
  import { KIND_ICONS } from "./bluetooth"
  import { dockAwake } from "./dock.svelte"
  import { radioError } from "./radio"

  let { compact = false, placement }: { compact?: boolean; placement: Placement } =
    $props()

  const POLL = 15_000
  const OPEN_POLL = 3_000
  const SETTLE = 2_000

  let radio = $state<RadioState | null>(null)
  let devices = $state<BluetoothDevice[]>([])
  let open = $state(false)
  let page = $state<"main" | "add">("main")
  let busy = $state(false)
  let acting = $state<string | null>(null)
  let error = $state("")

  const refresh = async () => {
    const list = await radios().catch(() => [])

    radio = list.find(r => r.kind === "bluetooth")?.state ?? null
    devices = radio === "on" ? await bluetoothDevices().catch(() => devices) : []
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, open ? OPEN_POLL : POLL)

    return () => clearInterval(timer)
  })

  $effect(() => {
    if (open) {
      error = ""
    } else {
      page = "main"
    }
  })

  const toggleRadio = async (on: boolean) => {
    busy = true
    error = ""

    await setRadio("bluetooth", on).catch((reason: unknown) => {
      error = radioError(String(reason))
    })

    await refresh()
    busy = false
  }

  const act = async (device: BluetoothDevice, run: () => Promise<unknown>) => {
    acting = device.id
    error = ""

    await run().catch(() => {
      error = m.dock_bluetooth_action_failed()
    })

    await refresh()
    acting = null
  }

  const connect = (device: BluetoothDevice) =>
    act(device, async () => {
      await bluetoothConnect(device.id, !device.connected)
      await new Promise(done => setTimeout(done, SETTLE))
    })

  const remove = (device: BluetoothDevice) =>
    act(device, () => bluetoothUnpair(device.id))

  const go = (url: string) => {
    open = false
    openUrl(url).catch(() => undefined)
  }

  const connected = $derived(devices.filter(d => d.connected))

  const icon = $derived(
    radio !== "on"
      ? "lucide:bluetooth-off"
      : connected.length > 0
        ? "lucide:bluetooth-connected"
        : "lucide:bluetooth",
  )

  const title = $derived.by(() => {
    if (radio !== "on") {
      return m.dock_bluetooth_off()
    }

    return connected.length > 0
      ? connected.map(d => d.name).join(", ")
      : m.dock_bluetooth_none()
  })
</script>

{#if radio !== null}
  <Popover label={m.dock_bluetooth()} {placement} width="w-80" bind:open>
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

    {#if page === "add"}
      <BluetoothAdd
        onback={() => (page = "main")}
        onpaired={() => {
          page = "main"
          refresh()
        }}
      />
    {:else}
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
          <p class="text-xs text-error" role="alert">{error}</p>
        {/if}

        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-medium text-base-content/60">
            {m.dock_bluetooth_paired()}
          </h3>

          {#if radio !== "on" || devices.length === 0}
            <p class="py-1 text-xs text-base-content/50">
              {radio !== "on" ? m.dock_bluetooth_off() : m.dock_bluetooth_no_paired()}
            </p>
          {:else}
            <ul class="flex max-h-60 flex-col overflow-y-auto">
              {#each devices as device (device.id)}
                <li class="flex min-h-10 items-center gap-2 px-2">
                  <Icon
                    icon={KIND_ICONS[device.kind]}
                    class={[
                      "size-4 shrink-0",
                      device.connected ? "text-primary" : "text-base-content/60",
                    ]}
                  />

                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate" title={device.name}>{device.name}</span>

                    <span class="text-xs text-base-content/60">
                      {device.connected
                        ? m.dock_bluetooth_state_connected()
                        : m.dock_bluetooth_state_idle()}
                    </span>
                  </span>

                  {#if device.audio}
                    <IconButton
                      icon={device.connected ? "lucide:unlink" : "lucide:link"}
                      label={device.connected
                        ? m.dock_bluetooth_disconnect()
                        : m.common_connect()}
                      size="xs"
                      busy={acting === device.id}
                      disabled={acting !== null}
                      onclick={() => connect(device)}
                    />
                  {/if}

                  <ConfirmButton
                    label={m.dock_bluetooth_remove()}
                    confirm={m.dock_bluetooth_remove_confirm()}
                    disabled={acting !== null}
                    class="btn-xs"
                    onconfirm={() => remove(device)}
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="flex flex-col">
          <MenuItem
            icon="lucide:plus"
            label={m.dock_bluetooth_add()}
            disabled={radio !== "on"}
            onclick={() => {
              error = ""
              page = "add"
            }}
          >
            {#snippet trailing()}
              <Icon icon="lucide:chevron-right" class="size-4 shrink-0 opacity-60" />
            {/snippet}
          </MenuItem>

          <MenuItem
            icon="lucide:settings-2"
            label={m.dock_bluetooth_settings()}
            onclick={() => go("ms-settings:bluetooth")}
          >
            {#snippet trailing()}
              <Icon icon="lucide:external-link" class="size-3.5 shrink-0 opacity-50" />
            {/snippet}
          </MenuItem>
        </div>
      </section>
    {/if}
  </Popover>
{/if}
