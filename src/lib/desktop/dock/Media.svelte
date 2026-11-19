<script lang="ts">
  import type { SpectrumStyle } from "@atrix/settings"
  import Icon from "@iconify/svelte"
  import { listen } from "@tauri-apps/api/event"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { type MediaAction, type MediaStatus, mediaCommand, mediaStatus } from "#lib/desktop/native/media.js"
  import { m } from "#lib/paraglide/messages.js"
  import { dockAwake } from "./dock.svelte"
  import Spectrum from "./Spectrum.svelte"

  type Props = {
    compact?: boolean
    spectrum?: boolean
    spectrumStyle?: SpectrumStyle
    placement: Placement
  }

  let { compact = false, spectrum = true, spectrumStyle = "bars", placement }: Props = $props()

  const POLL = 30_000
  const SETTLE = 1_000
  const STEP = 0.05
  const BAR_WIDTH = 10

  let status = $state<MediaStatus | null>(null)
  let failed = $state(false)
  let open = $state(false)
  let volume = $state<native.Volume | null>(null)
  let stripWidth = $state(0)
  let cardWidth = $state(0)
  let generation = 0
  let settleUntil = 0

  const refresh = async () => {
    const at = generation
    const next = await mediaStatus().catch(() => null)

    if (at === generation && Date.now() >= settleUntil) {
      status = next
      failed = false
    }
  }

  $effect(() => {
    const stop = listen("media-changed", () => void refresh())

    return () => {
      stop.then(off => off()).catch(() => undefined)
    }
  })

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  const readVolume = async () => {
    volume = await native
      .systemInfo()
      .then(info => info.volume)
      .catch(() => null)
  }

  $effect(() => {
    if (open) {
      readVolume()
    }
  })

  const send = async (action: MediaAction) => {
    const previous = $state.snapshot(status)

    generation += 1

    if (status && action === "playpause") {
      status.playing = !status.playing
      settleUntil = Date.now() + SETTLE
    }

    const sent = await mediaCommand(action)
      .then(() => true)
      .catch(() => false)

    failed = !sent

    if (!sent) {
      settleUntil = 0
      status = previous

      return
    }

    // SMTC acks delivery, not playback, so a read here still returns the old status
    if (action !== "playpause") {
      await refresh()
    } else {
      setTimeout(() => void refresh(), SETTLE)
    }
  }

  const setLevel = async (next: number) => {
    const clamped = Math.min(1, Math.max(0, Math.round(next * 100) / 100))

    volume = { level: clamped, muted: false }
    await native.setVolume(clamped).catch(() => undefined)
  }

  const onwheel = (e: WheelEvent) => {
    if (!volume) {
      readVolume()

      return
    }

    e.preventDefault()
    setLevel(volume.level + (e.deltaY < 0 ? STEP : -STEP))
  }

  const label = $derived(
    status ? [status.title, status.artist, status.app].filter(Boolean).join(", ") : "",
  )

  const subtitle = $derived(
    status ? [status.artist, status.app].filter(Boolean).join(", ") : "",
  )

  const level = $derived(Math.round((volume?.level ?? 0) * 100))
</script>

{#snippet controls(size: "xs" | "sm")}
  <IconButton
    icon="lucide:skip-back"
    label={m.dock_media_previous()}
    {size}
    iconClass="size-3.5"
    onclick={() => send("previous")}
  />

  <IconButton
    icon={status?.playing ? "lucide:pause" : "lucide:play"}
    label={status?.playing ? m.dock_media_pause() : m.dock_media_play()}
    title={failed ? m.dock_media_failed() : label}
    {size}
    tone={size === "sm" && open ? "primary" : "ghost"}
    class={failed ? "text-error" : undefined}
    onclick={() => send("playpause")}
  />

  <IconButton
    icon="lucide:skip-forward"
    label={m.dock_media_next()}
    {size}
    iconClass="size-3.5"
    onclick={() => send("next")}
  />
{/snippet}

{#if status}
  <fieldset
    class={[
      "relative isolate flex min-w-0 items-center gap-0.5",
      "overflow-hidden rounded-field",
    ]}
    bind:clientWidth={stripWidth}
    aria-label={m.dock_media()}
  >
    {#if spectrum && status.playing}
      <div class={[
        "pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex",
        "justify-center opacity-30",
      ]}>
        <Spectrum
          style={spectrumStyle}
          bars={Math.max(4, Math.floor(stripWidth / BAR_WIDTH))}
          height={28}
          gap={0}
          width={BAR_WIDTH}
        />
      </div>
    {/if}

    {@render controls("xs")}

    <Popover label={m.dock_now_playing()} {placement} width="w-80" bind:open>
      {#snippet trigger(p)}
        <button
          {...p}
          type="button"
          class={[
            "btn btn-ghost btn-xs max-w-32 justify-start px-1.5 font-normal",
            compact && "btn-square",
          ]}
          title={label}
          aria-label={m.dock_now_playing()}
          {onwheel}
        >
          {#if compact || !status?.title}
            <Icon icon="lucide:music" class="size-3.5 shrink-0" />
          {:else}
            <span class="truncate text-xs text-base-content/70">{status.title}</span>
          {/if}
        </button>
      {/snippet}

      <div class="relative isolate flex flex-col gap-3 overflow-hidden p-3" bind:clientWidth={cardWidth}>
        {#if spectrum && status.playing}
          <div class={[
            "pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex",
            "justify-center opacity-20",
          ]}>
            <Spectrum
              style={spectrumStyle}
              bars={Math.max(4, Math.floor(cardWidth / BAR_WIDTH))}
              height={110}
              gap={0}
              width={BAR_WIDTH}
            />
          </div>
        {/if}

        <div class="min-w-0">
          <p class="truncate text-sm font-medium" title={status.title}>
            {status.title || m.dock_media_nothing()}
          </p>

          <p class="truncate text-xs text-base-content/60" title={subtitle}>
            {subtitle || m.dock_media_no_info()}
          </p>
        </div>

        <div class="flex items-center justify-center gap-1">
          {@render controls("sm")}
        </div>

        <div class="flex items-center gap-2">
          <Icon icon="lucide:volume-2" class="size-4 shrink-0 text-base-content/60" />

          <input
            type="range"
            class="range range-primary range-xs grow"
            min="0"
            max="100"
            value={level}
            aria-label={m.dock_volume()}
            oninput={e => setLevel(Number(e.currentTarget.value) / 100)}
          />

          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-base-content/70">
            {level}%
          </span>
        </div>
      </div>
    </Popover>
  </fieldset>
{/if}
