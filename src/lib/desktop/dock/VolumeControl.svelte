<script lang="ts">
  import Icon from "@iconify/svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import MenuItem from "#lib/components/ui/MenuItem.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import SubMenu from "#lib/components/ui/SubMenu.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"
  import Mixer from "./Mixer.svelte"
  import { volumeIcon } from "./sound"

  type Props = {
    volume: native.Volume
    compact?: boolean
    placement: Placement
    onchange: (volume: native.Volume) => void
    ontogglemute: () => void
  }

  let { volume, compact = false, placement, onchange, ontogglemute }: Props =
    $props()

  const STEP = 0.05

  let open = $state(false)
  let page = $state<"main" | "mixer">("main")
  let devices = $state<native.AudioDevice[]>([])
  let switching = $state<string | null>(null)

  const loadDevices = async () => {
    devices = await native.audioDevices().catch(() => [])
  }

  $effect(() => {
    if (open) {
      loadDevices()
    } else {
      page = "main"
    }
  })

  const level = $derived(Math.round(volume.level * 100))

  const icon = $derived(volumeIcon(volume.level, volume.muted))

  const current = $derived(devices.find(d => d.default)?.name ?? "")

  const label = $derived(
    volume.muted ? m.dock_volume_muted() : m.dock_volume_level({ percent: level }),
  )

  const apply = async (next: number) => {
    const clamped = Math.min(1, Math.max(0, Math.round(next * 100) / 100))

    onchange({ level: clamped, muted: false })
    await native.setVolume(clamped).catch(() => undefined)
  }

  const onwheel = (e: WheelEvent) => {
    e.preventDefault()
    apply(volume.level + (e.deltaY < 0 ? STEP : -STEP))
  }

  const pick = async (device: native.AudioDevice) => {
    if (device.default) {
      return
    }

    switching = device.id
    await native.setAudioDevice(device.id).catch(() => undefined)
    await loadDevices()
    switching = null
  }
</script>

<Popover
  label={m.dock_sound()}
  {placement}
  width={page === "mixer" ? "w-80" : "w-72"}
  bind:open
>
  {#snippet trigger(p)}
    <button
      {...p}
      type="button"
      class={[
        "btn btn-ghost btn-square",
        compact ? "btn-xs" : "btn-sm",
        volume.muted && "text-base-content/50",
        open && "bg-primary/8 text-primary",
      ]}
      title={label}
      aria-label={label}
      {onwheel}
    >
      <Icon {icon} class="size-4" />
    </button>
  {/snippet}

  {#if page === "mixer"}
    <Mixer
      {volume}
      device={current}
      onmaster={apply}
      onsync={onchange}
      {ontogglemute}
      onback={() => (page = "main")}
    />
  {:else}
    <section class="flex flex-col gap-3 p-3 text-sm">
      <div class="flex items-center gap-2">
        <IconButton
          {icon}
          label={volume.muted ? m.dock_unmute() : m.dock_mute()}
          onclick={ontogglemute}
        />

        <input
          type="range"
          class="range range-primary range-xs grow"
          min="0"
          max="100"
          value={level}
          aria-label={m.dock_volume()}
          oninput={e => apply(Number(e.currentTarget.value) / 100)}
        />

        <span class="w-10 shrink-0 text-right text-xs tabular-nums text-base-content/70">
          {level}%
        </span>
      </div>

      <div class="flex flex-col">
        <SubMenu icon="lucide:speaker" label={m.dock_output_device()} value={current}>
          {#each devices as device (device.id)}
            <MenuItem
              icon="lucide:speaker"
              label={device.name}
              checked={device.default}
              disabled={switching !== null}
              onclick={() => pick(device)}
            />
          {:else}
            <p class="px-2 py-1 text-xs text-base-content/50">{m.dock_no_devices()}</p>
          {/each}
        </SubMenu>

        <MenuItem
          icon="lucide:sliders-vertical"
          label={m.dock_mixer()}
          onclick={() => (page = "mixer")}
        >
          {#snippet trailing()}
            <Icon icon="lucide:chevron-right" class="size-4 shrink-0 opacity-60" />
          {/snippet}
        </MenuItem>

        <MenuItem
          icon="lucide:settings"
          label={m.dock_sound_settings()}
          onclick={() => {
            open = false
            native.openUrl("ms-settings:sound").catch(() => undefined)
          }}
        >
          {#snippet trailing()}
            <Icon icon="lucide:external-link" class="size-3.5 shrink-0 opacity-50" />
          {/snippet}
        </MenuItem>
      </div>
    </section>
  {/if}
</Popover>
