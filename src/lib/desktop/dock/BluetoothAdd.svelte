<script lang="ts">
  import Icon from "@iconify/svelte"
  import type { Attachment } from "svelte/attachments"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import {
    type BluetoothDevice,
    bluetoothPair,
    bluetoothPairReply,
    bluetoothScan,
    onBluetoothScan,
    onPairingPrompt,
    type PairingPrompt,
  } from "#lib/desktop/native/bluetooth.js"
  import { m } from "#lib/paraglide/messages.js"
  import { KIND_ICONS, KIND_LABELS, pairError, SIGNAL_ICONS } from "./bluetooth"

  let { onback, onpaired }: { onback: () => void; onpaired: () => void } = $props()

  const PROMPTS: Record<PairingPrompt["kind"], () => string> = {
    display: m.dock_bluetooth_pin_display,
    confirm: m.dock_bluetooth_pin_confirm,
    provide: m.dock_bluetooth_pin_provide,
  }

  let found = $state<BluetoothDevice[]>([])
  let pairing = $state<string | null>(null)
  let prompt = $state<PairingPrompt | null>(null)
  let pin = $state("")
  let error = $state("")

  $effect(() => {
    let alive = true

    const listening = Promise.all([
      onBluetoothScan(list => {
        found = list
      }),
      onPairingPrompt(next => {
        if (next.id === pairing) {
          prompt = next
          pin = ""
        }
      }),
    ])

    listening
      .then(() => (alive ? bluetoothScan(true) : undefined))
      .catch(() => {
        error = m.dock_bluetooth_action_failed()
      })

    return () => {
      alive = false
      listening
        .then(offs => {
          for (const off of offs) {
            off()
          }
        })
        .catch(() => undefined)
      bluetoothScan(false).catch(() => undefined)

      if (pairing) {
        bluetoothPairReply(false).catch(() => undefined)
      }
    }
  })

  const pair = async (device: BluetoothDevice) => {
    if (pairing) {
      return
    }

    pairing = device.id
    prompt = null
    error = ""

    const failure = await bluetoothPair(device.id).then(
      () => null,
      (reason: unknown) => String(reason),
    )

    pairing = null
    prompt = null

    if (failure === null) {
      onpaired()

      return
    }

    error = pairError(failure)
  }

  const answer = (accept: boolean) => {
    const provided = prompt?.kind === "provide" ? pin.trim() : undefined

    prompt = null
    bluetoothPairReply(accept, provided).catch(() => undefined)
  }

  const focus: Attachment<HTMLInputElement> = node => {
    node.focus({ preventScroll: true })
  }
</script>

<section class="flex flex-col gap-3 p-3 text-sm">
  <header class="flex items-center gap-1">
    <IconButton icon="lucide:chevron-left" label={m.common_back()} size="xs" onclick={onback} />

    <h3 class="min-w-0 flex-1 truncate font-medium">{m.dock_bluetooth_add()}</h3>

    <span
      class="loading loading-spinner loading-xs text-base-content/50"
      title={m.dock_bluetooth_searching()}
      role="status"
      aria-label={m.dock_bluetooth_searching()}
    ></span>
  </header>

  {#if prompt}
    <div class="flex flex-col gap-2 rounded-field bg-base-200 p-3">
      <p class="text-xs">{PROMPTS[prompt.kind]()}</p>

      {#if prompt.kind === "provide"}
        <input
          class="input input-sm w-full"
          autocomplete="off"
          aria-label={m.dock_bluetooth_pin()}
          bind:value={pin}
          onkeydown={e => {
            if (e.key === "Enter" && pin.trim()) {
              answer(true)
            }
          }}
          {@attach focus}
        />
      {:else}
        <p class="text-center text-2xl font-semibold tracking-widest tabular-nums">
          {prompt.pin}
        </p>
      {/if}

      {#if prompt.kind !== "display"}
        <div class="flex justify-end gap-2">
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => answer(false)}>
            {m.common_cancel()}
          </button>

          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={prompt.kind === "provide" && !pin.trim()}
            onclick={() => answer(true)}
          >
            {m.dock_bluetooth_pair()}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if found.length === 0}
    <p class="py-1 text-xs text-base-content/50">{m.dock_bluetooth_searching()}</p>
  {:else}
    <ul class="flex max-h-60 flex-col overflow-y-auto">
      {#each found as device (device.id)}
        {@const active = pairing === device.id}

        <li>
          <button
            type="button"
            class={[
              "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-field px-2 text-left",
              "disabled:cursor-not-allowed disabled:opacity-40",
              active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
            ]}
            title={m.dock_bluetooth_pair_device({ name: device.name })}
            aria-busy={active}
            disabled={pairing !== null && !active}
            onclick={() => pair(device)}
          >
            <Icon icon={KIND_ICONS[device.kind]} class="size-4 shrink-0 opacity-70" />

            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate">{device.name}</span>

              <span class="truncate text-xs opacity-60">
                {active ? m.dock_bluetooth_pairing() : KIND_LABELS[device.kind]()}
              </span>
            </span>

            {#if active}
              <span class="loading loading-spinner loading-xs shrink-0"></span>
            {:else if device.signal !== null}
              <span class="shrink-0" title={m.dock_network_signal({ bars: device.signal })}>
                <Icon icon={SIGNAL_ICONS[device.signal - 1]} class="size-4 opacity-60" />
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if error}
    <p class="text-xs text-error" role="alert">{error}</p>
  {/if}
</section>
