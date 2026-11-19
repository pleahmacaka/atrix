<script module lang="ts">
import { persisted } from "../../store/persisted.svelte"

const sound = persisted("atrix-files.audio", { volume: 1, muted: false })
</script>

<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { toast } from "#lib/files/store/toast.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { currentLocale } from "#lib/store/locale.ts"
import { formatBytes } from "../../format"
import { baseName } from "../../locations"
import { allowPreview, assetUrl } from "../../native"
import ConfirmDialog from "../window/ConfirmDialog.svelte"
import {
  audioWaveform,
  clock,
  type Details,
  decodePeaks,
  type Progress,
  type Provider,
  readTranscript,
  type Transcript as Saved,
  transcribe,
} from "./audio"
import Transcript from "./Transcript.svelte"
import { transcribeSettings } from "./transcribe.svelte"
import Waveform from "./Waveform.svelte"

const SEEK_STEP = 5

const FALLBACK_LIMIT = 16 * 1024 * 1024

const ERRORS: Record<string, () => string> = {
  noKey: m.files_audio_errors_no_key,
  badKey: m.files_audio_errors_bad_key,
  rateLimited: m.files_audio_errors_rate_limited,
  network: m.files_audio_errors_network,
  tooLarge: m.files_audio_errors_too_large,
  unsupported: m.files_audio_errors_unsupported,
  missing: m.files_audio_errors_missing,
  provider: m.files_audio_errors_provider,
}

const PROVIDERS: Record<Exclude<Provider, "custom">, () => string> = {
  groq: m.files_audio_providers_groq,
  openai: m.files_audio_providers_openai,
}

let { path }: { path: string } = $props()

let player = $state<HTMLAudioElement>()

let source = $state("")

let peaks = $state<number[] | null>(null)

let size = $state<number | null>(null)

let details = $state<Details | null>(null)

let showSource = $state(false)

let duration = $state(0)

let current = $state(0)

let playing = $state(false)

let transcript = $state<Saved | null>(null)

let query = $state("")

let progress = $state<Progress | null>(null)

let confirming = $state(false)

let root = $state<HTMLElement>()

const name = $derived(baseName(path))

$effect(() => {
  let live = true

  const allowed = allowPreview(path).then(() => {
    if (live) {
      source = assetUrl(path)
    }
  })

  allowed.catch(() => toast(m.files_audio_errors_missing(), "error"))

  audioWaveform(path)
    .then(async waveform => {
      if (!live) {
        return
      }

      size = waveform.size
      details = waveform.details
      duration = waveform.duration ?? duration
      peaks = waveform.peaks

      if (!waveform.peaks && waveform.size <= FALLBACK_LIMIT) {
        await allowed

        const decoded = await decodePeaks(assetUrl(path))

        if (live) {
          peaks = decoded
        }
      }
    })
    .catch(() => undefined)

  readTranscript(path)
    .then(found => {
      if (live) {
        transcript = found
      }
    })
    .catch(() => undefined)

  return () => {
    live = false
  }
})

$effect(() => {
  if (!playing) {
    return
  }

  let frame = 0

  const tick = () => {
    current = player?.currentTime ?? current
    frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)

  return () => cancelAnimationFrame(frame)
})

const toggle = () => {
  if (!player) {
    return
  }

  if (player.paused) {
    player
      .play()
      .catch(() => toast(m.files_audio_errors_unsupported(), "error"))
  } else {
    player.pause()
  }
}

const seek = (seconds: number) => {
  const at = Math.min(duration || seconds, Math.max(0, seconds))

  current = at

  if (player) {
    player.currentTime = at
  }
}

const MOVES: Record<string, () => void> = {
  " ": toggle,
  ArrowLeft: () => seek(current - SEEK_STEP),
  ArrowRight: () => seek(current + SEEK_STEP),
}

const onkeydowncapture = (e: KeyboardEvent) => {
  const move = MOVES[e.key]
  const target = e.target as Node | null
  const inside = target === document.body || !!root?.contains(target)

  if (!move || !inside || e.altKey || e.ctrlKey) {
    return
  }

  if (target instanceof HTMLInputElement) {
    return
  }

  e.preventDefault()
  e.stopPropagation()
  move()
}

const errorText = (reason: unknown) => {
  const code = String(reason)

  return ERRORS[code]?.() ?? code
}

const run = async () => {
  progress = { stage: "uploading", done: 0, total: 1 }

  try {
    const result = await transcribe(
      path,
      transcribeSettings.provider,
      transcribeSettings.model,
      transcribeSettings.language,
      next => (progress = next),
    )

    transcript = result.transcript

    if (!result.saved) {
      toast(m.files_audio_errors_save_failed(), "error")
    }
  } catch (reason) {
    toast(errorText(reason), "error")
  } finally {
    progress = null
  }
}

const request = () => {
  if (transcript) {
    confirming = true
  } else {
    run()
  }
}

const progressText = (value: Progress) =>
  value.stage === "decoding"
    ? m.files_audio_progress_decoding()
    : m.files_audio_progress_uploading({ done: value.done, total: value.total })

const channelText = (count: number) =>
  count === 1
    ? m.files_audio_mono()
    : count === 2
      ? m.files_audio_stereo()
      : m.files_audio_channels({ count })

const facts = $derived.by(() => {
  if (!details) {
    return []
  }

  const locale = currentLocale()
  const bitrate =
    size && duration ? Math.round((size * 8) / duration / 1000) : null

  const entries: [string, string | number | null][] = [
    [m.files_audio_meta_title(), details.title],
    [m.files_audio_meta_artist(), details.artist],
    [m.files_audio_meta_album(), details.album],
    [m.files_audio_meta_year(), details.year],
    [m.files_audio_meta_track(), details.track],
    [m.files_audio_meta_genre(), details.genre],
    [
      m.files_audio_meta_sample_rate(),
      details.sampleRate &&
        `${(details.sampleRate / 1000).toLocaleString(locale)} kHz`,
    ],
    [
      m.files_audio_meta_channels(),
      details.channels && channelText(details.channels),
    ],
    [
      m.files_audio_meta_bitrate(),
      bitrate && `${bitrate.toLocaleString(locale)} kbps`,
    ],
  ]

  return entries.filter(([, value]) => !!value)
})

const volumeIcon = $derived(
  sound.muted || sound.volume === 0
    ? "lucide:volume-x"
    : sound.volume < 0.5
      ? "lucide:volume-1"
      : "lucide:volume-2",
)

const providerLabel = (value: Saved) =>
  value.provider === "custom" ? value.host : PROVIDERS[value.provider]()
</script>

<svelte:window {onkeydowncapture} />

<section
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none"
  aria-label={name}
  tabindex="-1"
  bind:this={root}
  {@attach node => node.focus({ preventScroll: true })}
>
  <audio
    bind:this={player}
    src={source || undefined}
    preload="metadata"
    bind:volume={sound.volume}
    bind:muted={sound.muted}
    onloadedmetadata={e => {
      if (Number.isFinite(e.currentTarget.duration)) {
        duration = e.currentTarget.duration
      }
    }}
    onplay={() => (playing = true)}
    onpause={() => {
      playing = false
      current = player?.currentTime ?? current
    }}
    onended={() => (playing = false)}
    onerror={() => toast(m.files_audio_errors_unsupported(), "error")}
  >
    <track kind="captions" />
  </audio>

  <div
    class={[
      "@container mx-auto flex w-full max-w-3xl flex-col gap-4",
      "px-6 py-5",
    ]}
  >
    <header class="flex min-w-0 items-baseline justify-between gap-4">
      <h2 class="min-w-0 truncate text-sm font-semibold" title={name}>
        {name}
      </h2>
      <div
        class={[
          "flex shrink-0 gap-3 text-xs whitespace-nowrap",
          "text-base-content/60 tabular-nums",
        ]}
      >
        {#if duration}
          <span>{clock(duration)}</span>
        {/if}
        {#if size !== null}
          <span>{formatBytes(size, currentLocale())}</span>
        {/if}
      </div>
    </header>

    {#if facts.length || details?.cover}
      <div class="flex min-w-0 items-start gap-4">
        {#if details?.cover}
          <img
            src={details.cover}
            alt=""
            class="size-16 shrink-0 rounded-field object-cover"
          />
        {/if}
        <dl
          class={[
            "grid min-w-0 grow grid-cols-2 gap-x-6 gap-y-1",
            "text-xs @lg:grid-cols-3",
          ]}
          aria-label={m.files_audio_details()}
        >
          {#each facts as [label, value] (label)}
            <div class="flex min-w-0 gap-2">
              <dt class="shrink-0 text-base-content/55">{label}</dt>
              <dd class="min-w-0 truncate tabular-nums" title={String(value)}>
                {value}
              </dd>
            </div>
          {/each}
        </dl>
      </div>
    {/if}

    <div class="flex min-w-0 items-center gap-4 rounded-box bg-inset px-4 py-3">
      <IconButton
        icon={playing ? "lucide:pause" : "lucide:play"}
        label={playing ? m.files_audio_pause() : m.files_audio_play()}
        tone="primary"
        shape="circle"
        class="shrink-0"
        disabled={!source}
        onclick={toggle}
      />
      <Waveform
        {peaks}
        progress={duration ? current / duration : 0}
        label={m.files_audio_position()}
        onseek={fraction => seek(fraction * duration)}
      />
      <span
        class={[
          "shrink-0 text-xs whitespace-nowrap",
          "text-base-content/70 tabular-nums",
        ]}
      >
        {clock(current)} / {clock(duration)}
      </span>
      <div class="flex shrink-0 items-center gap-1">
        <IconButton
          icon={volumeIcon}
          label={sound.muted ? m.files_audio_unmute() : m.files_audio_mute()}
          size="xs"
          aria-pressed={sound.muted}
          onclick={() => (sound.muted = !sound.muted)}
        />
        <input
          type="range"
          class="range range-primary range-xs w-20"
          min="0"
          max="1"
          step="0.05"
          aria-label={m.files_audio_volume()}
          bind:value={sound.volume}
          oninput={() => (sound.muted = false)}
        />
      </div>
    </div>

    <SearchField
      bind:value={query}
      label={m.files_audio_search()}
      disabled={!transcript?.segments.length}
      class="has-disabled:opacity-50"
    />

    <div class="flex min-h-8 min-w-0 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="shrink-0 text-xs font-medium text-base-content/60">
          {m.files_audio_transcript()}
        </h3>
        {#if transcript}
          <IconButton
            icon="lucide:info"
            label={m.files_audio_source()}
            size="xs"
            iconClass="size-3.5"
            aria-expanded={showSource}
            class={["shrink-0", showSource && "bg-primary/8 text-primary"]}
            onclick={() => (showSource = !showSource)}
          />
          {#if showSource}
            <span
              class="badge badge-soft badge-sm min-w-0 shrink truncate"
              title={providerLabel(transcript)}
            >
              {providerLabel(transcript)}
            </span>
            <span
              class="badge badge-soft badge-sm min-w-0 shrink truncate"
              title={transcript.model}
            >
              {transcript.model}
            </span>
          {/if}
        {/if}
      </div>

      {#if progress}
        <div
          class={[
            "flex shrink-0 items-center gap-2",
            "text-xs whitespace-nowrap text-base-content/70",
          ]}
        >
          <span class="loading loading-spinner loading-xs"></span>
          {progressText(progress)}
        </div>
      {:else}
        <button
          type="button"
          class="btn btn-ghost btn-xs shrink-0"
          onclick={request}
        >
          <Icon icon="lucide:audio-lines" class="size-3.5" />
          {transcript
            ? m.files_audio_retranscribe()
            : m.files_audio_transcribe()}
        </button>
      {/if}
    </div>

    {#if progress?.stage === "uploading" && progress.total > 1}
      <progress
        class="progress progress-primary w-full"
        value={progress.done}
        max={progress.total}
      ></progress>
    {/if}

    <Transcript {transcript} {query} {current} {playing} onseek={seek} />
  </div>
</section>

<ConfirmDialog
  bind:open={confirming}
  title={m.files_audio_replace_title()}
  body={m.files_audio_replace_body()}
  action={m.files_audio_retranscribe()}
  onconfirm={run}
/>
