<script lang="ts">
import Icon from "@iconify/svelte"
import { diffArrays, diffLines } from "diff"
import { onMount } from "svelte"
import Markdown from "#lib/components/chat/Markdown.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { actorDetail, actorName, timeAgo, timeOf } from "#lib/knowledge/actor.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Version } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  host,
  id,
  etag,
  onrevert,
}: {
  host: HostView
  id: string
  etag: string
  onrevert: (version: Version) => void
} = $props()

type Revision = Version & {
  number: number
  body: string
  added: number
  removed: number
}

const attempt = new Attempt()

let revisions = $state<Revision[]>([])

let selected = $state<number | null>(null)

let view = $state<"rendered" | "source">("rendered")

const lineCount = (text: string) => text.split("\n").filter(Boolean).length

onMount(() =>
  attempt.run(async () => {
    const versions = (await host.historyDoc(id)).toSorted((a, b) =>
      a.modified.localeCompare(b.modified),
    )
    const bodies = await Promise.all(
      versions.map(async v => (await host.readDoc(id, v.versionId)).body),
    )

    revisions = versions
      .map((v, i) => {
        const parts = diffLines(bodies[i - 1] ?? "", bodies[i])

        return {
          ...v,
          number: i + 1,
          body: bodies[i],
          added: parts.filter(p => p.added).reduce((n, p) => n + lineCount(p.value), 0),
          removed: parts
            .filter(p => p.removed)
            .reduce((n, p) => n + lineCount(p.value), 0),
        }
      })
      .toReversed()
  }),
)

const detail = $derived(revisions.find(r => r.number === selected) ?? null)

const previous = $derived(
  detail ? (revisions.find(r => r.number === detail.number - 1) ?? null) : null,
)

const blocks = (text: string) =>
  text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)

const rendered = $derived(
  detail
    ? diffArrays(blocks(previous?.body ?? ""), blocks(detail.body)).flatMap(part =>
        part.value.map(text => ({
          text,
          kind: part.added ? "added" : part.removed ? "removed" : "same",
        })),
      )
    : [],
)

const source = $derived(
  detail ? diffLines(previous?.body ?? "", detail.body) : [],
)

const clip = (text: string) => {
  const lines = text.split("\n")

  return lines.length > 6
    ? [...lines.slice(0, 2), "…", ...lines.slice(-3)].join("\n")
    : text
}
</script>

<ErrorAlert message={attempt.failure} />

{#if detail}
  <nav class="breadcrumbs py-0 text-sm text-base-content/55">
    <ul>
      <li>
        <button
          type="button"
          class="cursor-pointer hover:text-base-content"
          onclick={() => {
            selected = null
          }}
        >
          {m.knowledge_history_title()}
        </button>
      </li>
      <li>r{detail.number}</li>
    </ul>
  </nav>
  <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">r{detail.number}</h2>
      <p class="mt-2 text-sm text-base-content/60">
        <span title={actorDetail(detail.actor)}>{actorName(detail.actor)}</span>,
        <time class="tabular-nums">{timeOf(detail.modified)}</time>,
        {previous
          ? m.knowledge_compare_prev({ number: previous.number })
          : m.knowledge_first()}
      </p>
    </div>
    {#if detail.etag !== etag && !detail.latest}
      <button type="button" class="btn btn-sm btn-outline" onclick={() => onrevert(detail)}>
        <Icon icon="lucide:undo-2" class="size-4" />
        {m.knowledge_revert_to()}
      </button>
    {/if}
  </div>
  <div role="tablist" class="tabs tabs-box tabs-sm mt-6 w-fit">
    <button
      type="button"
      role="tab"
      class={["tab", view === "rendered" && "tab-active"]}
      onclick={() => (view = "rendered")}
    >
      {m.knowledge_rendered()}
    </button>
    <button
      type="button"
      role="tab"
      class={["tab", view === "source" && "tab-active"]}
      onclick={() => (view = "source")}
    >
      {m.knowledge_source()}
    </button>
  </div>
  {#if view === "rendered"}
    <div class="mt-4 grid gap-2">
      {#each rendered as block, i (i)}
        <div
          class={[
            "rounded-box border-l-4 px-5 py-3",
            block.kind === "added" && "border-success bg-success/8",
            block.kind === "removed" && "border-error bg-error/8 line-through opacity-70",
            block.kind === "same" && "border-transparent opacity-55",
          ]}
        >
          <Markdown text={block.text} look="wiki" />
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="mt-4 overflow-hidden rounded-box border border-base-300 text-sm leading-relaxed"
    >
      {#each source as part, i (i)}
        <div
          class={[
            "border-l-4 px-4 py-1 break-words whitespace-pre-wrap",
            part.added && "border-success bg-success/10",
            part.removed && "border-error bg-error/10 line-through decoration-error/40",
            !part.added && !part.removed && "border-transparent text-base-content/55",
          ]}
        >{!part.added && !part.removed ? clip(part.value) : part.value}</div>
      {/each}
    </div>
  {/if}
{:else}
  <h2 class="text-2xl font-bold tracking-tight">{m.knowledge_history_title()}</h2>
  <ol class="mt-6 flex flex-col gap-1">
    {#each revisions as revision (revision.versionId)}
      <li>
        <button
          type="button"
          class={[
            "flex w-full cursor-pointer items-center gap-4 rounded-box px-5 py-3.5",
            "text-start",
            "transition-colors hover:bg-base-200",
          ]}
          onclick={() => (selected = revision.number)}
        >
          <span class="w-12 shrink-0 font-semibold text-primary tabular-nums">
            r{revision.number}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium" title={actorDetail(revision.actor)}>
              {actorName(revision.actor)}
            </span>
            <span class="mt-0.5 block truncate text-xs text-base-content/55">
              <time title={timeOf(revision.modified)}>{timeAgo(revision.modified)}</time>
            </span>
          </span>
          {#if revision.latest}
            <span class="badge badge-ghost badge-sm whitespace-nowrap">
              {m.knowledge_current()}
            </span>
          {/if}
          <span class="flex gap-2 text-xs font-medium whitespace-nowrap tabular-nums">
            <span class="text-success">+{revision.added}</span>
            <span class="text-error">−{revision.removed}</span>
          </span>
        </button>
      </li>
    {:else}
      <li class="px-5 py-8 text-center text-sm text-base-content/55">
        {#if attempt.busy}
          <span class="loading loading-spinner loading-sm"></span>
        {:else}
          {m.knowledge_no_history()}
        {/if}
      </li>
    {/each}
  </ol>
{/if}
