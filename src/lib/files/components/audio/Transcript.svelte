<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"
import { clock, type Transcript } from "./audio"

let {
  transcript,
  query,
  current,
  playing,
  onseek,
}: {
  transcript: Transcript | null
  query: string
  current: number
  playing: boolean
  onseek: (seconds: number) => void
} = $props()

let rows = $state<HTMLElement[]>([])

const segments = $derived(transcript?.segments ?? [])

const active = $derived(segments.findLastIndex(s => s.start <= current))

const needle = $derived(query.trim().toLowerCase())

const shown = $derived(
  segments
    .map((segment, index) => ({ segment, index }))
    .filter(
      ({ segment }) =>
        !needle ||
        segment.text.toLowerCase().includes(needle) ||
        !!segment.speaker?.toLowerCase().includes(needle),
    ),
)

$effect(() => {
  if (playing && !needle && active >= 0) {
    rows[active]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
})

const parts = (text: string) => {
  if (!needle) {
    return [{ text, hit: false }]
  }

  const lower = text.toLowerCase()
  const found: { text: string; hit: boolean }[] = []
  let from = 0

  for (
    let at = lower.indexOf(needle);
    at >= 0;
    at = lower.indexOf(needle, from)
  ) {
    found.push({ text: text.slice(from, at), hit: false })
    found.push({ text: text.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }

  found.push({ text: text.slice(from), hit: false })

  return found.filter(part => part.text)
}
</script>

{#if !transcript}
  <EmptyState icon="lucide:audio-lines" text={m.files_audio_empty()} />
{:else if !shown.length}
  <EmptyState icon="lucide:search-x" text={m.files_audio_no_matches()} />
{:else}
  <ol class="flex flex-col gap-0.5">
    {#each shown as { segment, index } (index)}
      {@const now = index === active && (playing || current > 0)}

      <li
        bind:this={rows[index]}
        class={[
          "flex min-w-0 gap-3 rounded-field px-2 py-1.5",
          "transition-colors duration-140",
          now && "bg-primary/8 text-primary",
        ]}
      >
        <button
          type="button"
          class={[
            "w-12 shrink-0 cursor-pointer pt-0.5",
            "text-start text-xs tabular-nums",
            "transition-colors duration-140 hover:text-primary",
            now ? "text-primary" : "text-base-content/55",
          ]}
          onclick={() => onseek(segment.start)}
        >
          {clock(segment.start)}
        </button>

        <div class="flex min-w-0 flex-col gap-0.5">
          {#if segment.speaker}
            <span
              class={[
                "text-xs",
                now ? "text-primary/70" : "text-base-content/55",
              ]}
            >
              {segment.speaker}
            </span>
          {/if}
          <p class="text-sm leading-relaxed break-words select-text">
            {#each parts(segment.text) as part, at (at)}
              {#if part.hit}
                <mark class="rounded-sm bg-warning/40 text-inherit">
                  {part.text}
                </mark>
              {:else}
                {part.text}
              {/if}
            {/each}
          </p>
        </div>
      </li>
    {/each}
  </ol>
{/if}
