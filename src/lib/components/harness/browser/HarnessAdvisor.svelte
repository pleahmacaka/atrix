<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import Select, { type SelectOption } from "#lib/components/ui/Select.svelte"
import { type Ranked, rankingOf, servedBy, USES, type Use } from "#lib/harness/arena.ts"
import {
  type AdvisorPick,
  advise,
  FRONTIER,
  FRONTIER_MODELS,
  FRONTIER_SOURCE,
  FRONTIER_VENDORS,
  SUBSCRIPTIONS,
} from "#lib/harness/frontier.ts"
import { logFailure } from "#lib/logging.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { activeGateways } from "#lib/store/gatewayCatalog.ts"
import { modelIdsOf } from "#lib/store/gateways.svelte.ts"

const USE_LABELS: Record<Use, () => string> = {
  agent: m.advisor_use_agent,
  webdev: m.advisor_use_webdev,
  text: m.advisor_use_text,
  document: m.advisor_use_document,
  vision: m.advisor_use_vision,
  search: m.advisor_use_search,
}

const uses: SelectOption<Use>[] = USES.map(u => ({
  value: u.id,
  icon: u.icon,
  label: USE_LABELS[u.id](),
}))

let use = $state<Use>("agent")

const coding = $derived(use === "agent" || use === "webdev")

let pick = $state("")

let usableOnly = $state(false)

let ranking = $state<Ranked[]>([])

let failed = $state(false)

let loading = $state(false)

let modelIds = $state<string[]>([])

const options: SelectOption<string>[] = [
  { value: "", label: m.advisor_any() },
  ...FRONTIER_MODELS.map(model => ({
    value: `model:${model}`,
    label: model,
    detail: FRONTIER_VENDORS[model],
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

const modelPicked = $derived(pick.startsWith("model:"))

const parsed = $derived.by((): AdvisorPick => {
  const at = pick.indexOf(":")
  const kind = pick.slice(0, at)
  const value = pick.slice(at + 1)

  if (kind === "model") {
    const model = FRONTIER_MODELS.find(name => name === value)

    return model ? { kind, model } : null
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

  failed = false
  loading = true
  ranking = []
  rankingOf(chosen)
    .then(rows => {
      if (chosen === use) {
        ranking = rows
      }
    })
    .catch(e => {
      logFailure("arena ranking", e)

      if (chosen === use) {
        ranking = []
        failed = true
      }
    })
    .finally(() => {
      if (chosen === use) {
        loading = false
      }
    })
})

$effect(() => {
  Promise.all(activeGateways().map(g => modelIdsOf(g).catch(() => [])))
    .then(found => {
      modelIds = found.flat()
    })
    .catch(() => {})
})

const usd = new Intl.NumberFormat(getLocale(), {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat(getLocale(), {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const whole = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 })

const lists = new Intl.ListFormat(getLocale(), { type: "unit" })

const sources = $derived(
  lists.format([
    ...(coding ? [FRONTIER_SOURCE] : []),
    ...(ranking[0]
      ? [
          ranking[0].published
            ? m.advisor_arena({ date: ranking[0].published })
            : m.advisor_arena_undated(),
        ]
      : []),
  ]),
)
</script>

<div class="flex flex-col gap-3 @container">
    <div class="flex flex-wrap items-center gap-2">
      <Select options={uses} bind:value={use} label={m.advisor_title()} class="min-w-0 flex-1" />
      {#if coding}
        <Select
          {options}
          bind:value={pick}
          label={m.advisor_pick()}
          class="min-w-0 flex-1"
        />
      {/if}
      <label class="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={usableOnly} />
        {m.advisor_usable_only()}
      </label>
    </div>

    <div class={["grid grid-cols-1 gap-3", coding && "@2xl:grid-cols-2"]}>
      {#if coding}
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex items-center gap-2 px-2 text-xs font-medium text-base-content/60">
            <span class="min-w-0 flex-1 truncate">{m.advisor_combos()}</span>
            {#if !modelPicked}
              <span class="w-20 shrink-0 text-end whitespace-nowrap">{m.advisor_pass()}</span>
            {/if}
            <span class="w-20 shrink-0 text-end whitespace-nowrap">{m.advisor_cost()}</span>
          </div>
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
              {#if i === 0 && combos.length > 1}
                <span class="badge badge-primary badge-xs whitespace-nowrap">{m.advisor_best()}</span>
              {/if}
              {#if !modelPicked}
                <span class="w-20 shrink-0 text-end text-xs text-base-content/60 tabular-nums">
                  {percent.format(c.row.pass / 100)}
                </span>
              {/if}
              <span class="w-20 shrink-0 text-end text-xs text-base-content/60 tabular-nums">
                {usd.format(c.cost)}
              </span>
            </div>
          {:else}
            <p class="py-2 text-sm text-base-content/60">{m.advisor_none()}</p>
          {/each}
        </div>
      {/if}

      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-base-content/60">{m.advisor_models()}</span>
        {#if failed}
          <p class="py-2 text-sm text-base-content/60">{m.advisor_arena_failed()}</p>
        {:else if loading}
          <span role="status" class="loading loading-dots loading-sm my-2 opacity-60" aria-label={m.advisor_loading()}></span>
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
              <span class="w-12 shrink-0 text-end text-xs text-base-content/60 tabular-nums">{model.share ? percent.format(model.rating) : whole.format(model.rating)}</span>
            </div>
          {:else}
            <p class="py-2 text-sm text-base-content/60">{m.advisor_none()}</p>
          {/each}
        {/if}
      </div>
    </div>

    {#if sources}
      <p class="text-xs text-base-content/50">
        {m.advisor_sources({ list: sources })}
      </p>
    {/if}
</div>
