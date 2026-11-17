<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { primers, prompts, providers } from "#lib/agents/agents.svelte.ts"
import { blueprintIn, builderBrief, nameTaken, PART_ICONS } from "#lib/agents/compose.ts"
import { chatFor } from "#lib/chat/live.svelte.ts"
import ModelChat from "#lib/components/chat/ModelChat.svelte"
import SessionChat from "#lib/components/chat/SessionChat.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local, type StoredAgent, type StoredChat } from "#lib/store/local.svelte.ts"
import ProviderSelect from "./ProviderSelect.svelte"

type Draft = Omit<StoredAgent, "id" | "at"> & { id: null }

type Talk = { kind: "chat"; stored: StoredChat } | { kind: "session"; view: HostView; id: string }

let { onapply, onmanual }: { onapply: (draft: Draft) => void; onmanual: () => void } = $props()

const attempt = new Attempt()

const options = $derived(providers())

let partner = $state(untrack(() => providers()[0]?.key ?? ""))

let talk = $state<Talk | null>(null)

const end = async () => {
  const current = talk

  talk = null

  if (current?.kind === "session") {
    await current.view.close(current.id).catch(() => {})
  }
}

$effect(() => () => {
  untrack(end)
})

const start = () =>
  attempt.run(async () => {
    const chosen = options.find(p => p.key === partner)

    if (!chosen) {
      return
    }

    const brief = builderBrief(
      options.map(p => ({ key: p.key, kind: p.kind, label: p.label })),
      local.data.prompts,
    )

    if (chosen.kind === "gateway") {
      talk = {
        kind: "chat",
        stored: {
          id: crypto.randomUUID(),
          title: m.builder_title(),
          gateway: chosen.gateway,
          model: chosen.model,
          instructions: brief,
          messages: [],
          at: Date.now(),
        },
      }

      return
    }

    const view = hostById(chosen.host)

    if (!view) {
      throw new Error(m.chat_no_device())
    }

    const id = await view.create(chosen.harness, view.state?.home ?? "")

    primers.set(id, brief)
    talk = { kind: "session", view, id }
  })

const reply = $derived.by(() => {
  if (!talk) {
    return ""
  }

  if (talk.kind === "chat") {
    const last = chatFor(talk.stored).messages.findLast(x => x.role === "assistant")

    return (last?.parts ?? []).flatMap(p => (p.type === "text" ? [p.text] : [])).join("\n")
  }

  const last = (talk.view.views[talk.id]?.items ?? []).findLast(i => i.type === "agent")

  return last?.type === "agent" ? last.text : ""
})

const blueprint = $derived(blueprintIn(reply))

const kept = $derived(
  (blueprint?.parts ?? []).filter(p => nameTaken(local.data.prompts, p.kind, p.name, null)),
)

const target = $derived(options.find(p => p.key === blueprint?.provider))

const apply = () =>
  attempt.run(async () => {
    if (!blueprint) {
      return
    }

    for (const part of blueprint.parts ?? []) {
      if (!nameTaken(local.data.prompts, part.kind, part.name, null)) {
        await prompts.save({ id: null, ...part })
      }
    }

    onapply({
      id: null,
      name: blueprint.name.trim(),
      provider: target?.key ?? "",
      model: blueprint.model || (target?.kind === "gateway" ? target.model : ""),
      effort: blueprint.effort ?? "",
      instructions: blueprint.instructions,
      variables: blueprint.variables ?? {},
      requires: blueprint.requires ?? {},
      cwd: "",
    })
    await end()
  })
</script>

<section class="flex min-h-0 flex-1 flex-col">
  <div class="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 pt-4">
    <div class="w-64 max-sm:w-full">
      <ProviderSelect
        {options}
        value={partner}
        label={m.builder_partner()}
        disabled={!!talk}
        onchange={key => {
          partner = key
        }}
      />
    </div>
    {#if talk}
      <button type="button" class="btn btn-sm" onclick={() => attempt.run(end)}>
        <Icon icon="lucide:rotate-ccw" class="size-4" />
        {m.builder_restart()}
      </button>
    {:else}
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={attempt.busy || !partner}
        onclick={start}
      >
        <Icon icon="lucide:message-square-plus" class="size-4" />
        {m.agent_start_chat()}
      </button>
    {/if}
    <span class="flex-1"></span>
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      onclick={async () => {
        await end()
        onmanual()
      }}
    >
      <Icon icon="lucide:pencil" class="size-4" />
      {m.builder_manual()}
    </button>
  </div>
  {#if talk?.kind === "chat"}
    <ModelChat stored={talk.stored} />
  {:else if talk?.kind === "session"}
    <SessionChat host={talk.view} sessionId={talk.id} />
  {:else}
    <EmptyState
      centered
      icon="lucide:wand-sparkles"
      title={m.builder_title()}
      text={m.builder_text()}
    />
  {/if}
  {#if blueprint}
    <div class="mx-auto mb-4 flex w-full max-w-3xl flex-col gap-2 px-4">
      <div class="flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon icon={target?.icon ?? "lucide:bot"} class="size-5" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm font-medium">{blueprint.name}</span>
          <span class="truncate text-xs text-base-content/55">
            {[target?.label, blueprint.model, m.builder_parts({ count: blueprint.parts?.length ?? 0 })]
              .filter(Boolean)
              .join(", ")}
          </span>
        </span>
        <button type="button" class="btn btn-primary btn-sm" disabled={attempt.busy} onclick={apply}>
          <Icon icon="lucide:check" class="size-4" />
          {m.builder_apply()}
        </button>
      </div>
      {#if blueprint.parts?.length}
        <div class="flex flex-wrap gap-1 px-1">
          {#each blueprint.parts as part (`${part.kind}:${part.name}`)}
            <span class="badge badge-soft badge-sm gap-1">
              <Icon icon={PART_ICONS[part.kind]} class="size-3" />
              {part.name}.{part.kind}
            </span>
          {/each}
        </div>
      {/if}
      {#if kept.length}
        <p class="px-1 text-xs text-warning">
          {m.builder_kept({ names: kept.map(p => p.name).join(", ") })}
        </p>
      {/if}
    </div>
  {/if}
  <div class="mx-auto w-full max-w-3xl px-4">
    <ErrorAlert message={attempt.failure} />
  </div>
</section>
