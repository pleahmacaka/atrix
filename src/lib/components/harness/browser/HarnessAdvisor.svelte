<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select, { type SelectOption } from "#lib/components/ui/Select.svelte"
import { type Ranked, rankingOf, servedBy, USES, type Use } from "#lib/harness/arena.ts"
import {
  advise,
  FRONTIER,
  FRONTIER_MODELS,
  FRONTIER_SOURCE,
  type FrontierModel,
  type Pick,
  SUBSCRIPTIONS,
} from "#lib/harness/frontier.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways, modelIdsOf } from "#lib/store/gateways.svelte.ts"

const USE_LABELS: Record<Use, () => string> = {
  agent: m.advisor_use_agent,
  webdev: m.advisor_use_webdev,
  text: m.advisor_use_text,
  document: m.advisor_use_document,
  vision: m.advisor_use_vision,
  search: m.advisor_use_search,
}

const uses = USES.map(u => ({ id: u.id, icon: u.icon, label: USE_LABELS[u.id]() }))

let use = $state<Use>("agent")

let pick = $state("")

let usableOnly = $state(false)

let ranking = $state<Ranked[]>([])

let failure = $state<string | null>(null)

let modelIds = $state<string[]>([])

const options: SelectOption<string>[] = [
  { value: "", label: m.advisor_any() },
  ...FRONTIER_MODELS.map(model => ({
    value: `model:${model}`,
    label: model,
    group: m.advisor_group_model(),
  })),
  ...SUBSCRIPTIONS.map(s => ({
    value: `subscription:${s.id}`,
    label: s.label,
    group: m.advisor_group_subscription(),
    icon: brandIcon(s.harness),
  })),
  ...FRONTIER.map(r => ({
    value: `harness:${r.name}`,
    label: r.name,
    group: m.advisor_group_harness(),
    icon: brandIcon(r.harness ?? ""),
  })),
]

const parsed = $derived.by((): Pick => {
  const at = pick.indexOf(":")
  const kind = pick.slice(0, at)
  const value = pick.slice(at + 1)

  if (kind === "model") {
    return { kind, model: value as FrontierModel }
  }

  if (kind === "subscription") {
    return { kind, id: value }
  }

  return kind === "harness" ? { kind, name: value } : null
})

const installed = $derived(
  new Set(hostList().flatMap(h => (h.view.state?.harnesses ?? []).map(x => x.base))),
)

const combos = $derived(
  advise(parsed, r => !usableOnly || (!!r.harness && installed.has(r.harness))).slice(0, 4),
)

const models = $derived(
  ranking.filter(r => !usableOnly || servedBy(r.name, modelIds)).slice(0, 5),
)

$effect(() => {
  const chosen = use

  failure = null
  rankingOf(chosen)
    .then(rows => {
      if (chosen === use) {
        ranking = rows
      }
    })
    .catch(e => {
      ranking = []
      failure = errorText(e)
    })
})

$effect(() => {
  Promise.all(activeGateways().map(g => modelIdsOf(g).catch(() => [])))
    .then(lists => {
      modelIds = lists.flat()
    })
    .catch(() => {})
})

const money = (value: number) => `$${value.toFixed(2)}`
</script>

<Section icon="lucide:sparkles" title={m.advisor_title()}>
  <div class="flex flex-col gap-3 @container">
    <div class="overflow-x-auto scrollbar-none">
      <Segmented items={uses} value={use} onpick={id => (use = id)} />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Select
        {options}
        bind:value={pick}
        label={m.advisor_pick()}
        class="min-w-0 flex-1"
      />
      <label class="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={usableOnly} />
        {m.advisor_usable_only()}
      </label>
    </div>

    <div class="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-base-content/60">{m.advisor_combos()}</span>
        {#each combos as c, i (c.row.name)}
          <div
            class={[
              "flex min-w-0 items-center gap-2 rounded-field px-2 py-1.5 text-sm",
              i === 0 ? "bg-primary/8" : "bg-base-200/60",
            ]}
          >
            <Icon icon={brandIcon(c.row.harness ?? "")} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">
              <span class="font-medium">{c.row.name}</span>
              {#if c.model}
                <span class="text-base-content/60"> + {c.model}</span>
              {/if}
            </span>
            {#if i === 0}
              <span class="badge badge-primary badge-xs whitespace-nowrap">{m.advisor_best()}</span>
            {/if}
            <span class="w-24 shrink-0 text-end text-xs text-base-content/60 tabular-nums">
              {c.row.pass.toFixed(1)}% · {money(c.cost)}
            </span>
          </div>
        {:else}
          <p class="py-2 text-sm text-base-content/60">{m.advisor_none()}</p>
        {/each}
      </div>

      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-base-content/60">{m.advisor_models()}</span>
        {#if failure}
          <p class="py-2 text-sm text-base-content/60">{m.advisor_arena_failed()}</p>
        {:else}
          {#each models as model, i (model.name)}
            <div
              class={[
                "flex min-w-0 items-center gap-2 rounded-field px-2 py-1.5 text-sm",
                i === 0 ? "bg-primary/8" : "bg-base-200/60",
              ]}
            >
              <span class="w-5 shrink-0 text-xs text-base-content/50 tabular-nums">{model.rank}</span>
              <span class="min-w-0 flex-1 truncate font-medium" title={model.organization}>{model.name}</span>
              <span class="w-12 shrink-0 text-end text-xs text-base-content/60 tabular-nums">{model.rating}</span>
            </div>
          {:else}
            <p class="py-2 text-sm text-base-content/60">{m.advisor_none()}</p>
          {/each}
        {/if}
      </div>
    </div>

    <p class="text-xs text-base-content/50">
      {m.advisor_sources({ frontier: FRONTIER_SOURCE, arena: ranking[0]?.published ?? "" })}
    </p>
  </div>
</Section>
