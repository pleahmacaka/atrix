<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import Select from "#lib/components/ui/Select.svelte"
import { m } from "#lib/paraglide/messages.js"
import { type SerialPort, serialPorts } from "../pty"
import { prefs } from "./prefs.svelte"

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const BAUD_OPTIONS = BAUDS.map(value => ({
  value,
  label: value.toLocaleString(),
}))

let {
  open = $bindable(false),
  onconnect,
}: { open?: boolean; onconnect: (shell: string) => void } = $props()

let ports = $state<SerialPort[]>([])

let chosen = $state<string | null>(null)

let loading = $state(false)

const refresh = async () => {
  loading = true
  ports = await serialPorts().catch(() => [])
  loading = false

  if (!ports.some(port => port.id === chosen)) {
    chosen = ports[0]?.id ?? null
  }
}

$effect(() => {
  if (open) {
    refresh()
  }
})

const connect = () => {
  if (chosen) {
    open = false
    onconnect(`${chosen}@${prefs.baud}`)
  }
}
</script>

<Modal bind:open label={m.terminal_serial_title()} class="w-full max-w-md">
  <div class="flex flex-col gap-4 p-5">
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon icon="lucide:usb" class="size-5" />
      <span class="min-w-0 flex-1 truncate">{m.terminal_serial_title()}</span>
      <IconButton
        icon="lucide:refresh-cw"
        label={m.terminal_serial_refresh()}
        busy={loading}
        onclick={refresh}
      />
    </h2>

    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-base-content/60">
        {m.terminal_serial_ports()}
      </span>
      {#if ports.length > 0}
        <div
          role="listbox"
          aria-label={m.terminal_serial_ports()}
          class="flex max-h-60 flex-col gap-0.5 overflow-y-auto"
        >
          {#each ports as port (port.id)}
            {@const selected = chosen === port.id}
            <button
              type="button"
              role="option"
              aria-selected={selected}
              title={port.detail ? `${port.name} ${port.detail}` : port.name}
              class={[
                "flex h-9 w-full min-w-0 cursor-pointer items-center gap-3",
                "rounded-field px-3",
                "text-left text-sm transition-colors duration-140",
                selected
                  ? "bg-primary/8 text-primary"
                  : "hover:bg-base-content/8",
              ]}
              onclick={() => (chosen = port.id)}
              ondblclick={connect}
            >
              <span class="w-24 shrink-0 truncate font-medium">
                {port.name}
              </span>
              <span class="min-w-0 flex-1 truncate text-base-content/60">
                {port.detail ?? ""}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <EmptyState
          icon="lucide:usb"
          text={m.terminal_serial_none()}
          dashed
          class="py-6"
        />
      {/if}
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-base-content/60">
        {m.terminal_serial_baud()}
      </span>
      <Select
        label={m.terminal_serial_baud()}
        options={BAUD_OPTIONS}
        bind:value={prefs.baud}
        class="w-full"
      />
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => (open = false)}
      >
        {m.common_cancel()}
      </button>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={!chosen}
        onclick={connect}
      >
        <Icon icon="lucide:plug" class="size-4" />
        {m.common_connect()}
      </button>
    </div>
  </div>
</Modal>
