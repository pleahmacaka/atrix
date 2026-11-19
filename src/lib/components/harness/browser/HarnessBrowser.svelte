<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import { autoDetect } from "#lib/harness/autoDetect.ts"
import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { Available, Presence } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { describeHarness } from "./descriptions.ts"
import HarnessAdvisor from "./HarnessAdvisor.svelte"

let { onback }: { onback: () => void } = $props()

const attempt = new Attempt()

$effect(autoDetect)

const hosts = $derived(hostList())

let query = $state("")

let busy = $state<string | null>(null)

let tab = $state<"catalog" | "compare">("catalog")

const TABS = [
  { id: "catalog" as const, label: m.harness_available(), icon: "lucide:layout-grid" },
  { id: "compare" as const, label: m.advisor_title(), icon: "lucide:chart-bar" },
]

const STATES: Record<Presence, () => string> = {
  installed: m.harness_group_installed,
  runner: m.harness_on_demand,
  download: m.harness_on_demand,
  missing: m.harness_unavailable,
}

type Offer = { host: HostEntry; harness: Available }

const catalog = $derived.by(() => {
  const offers = new Map<string, Offer[]>()

  for (const host of hosts) {
    for (const harness of host.view.state?.available ?? []) {
      if (harness.state !== "installed") {
        offers.set(harness.id, [...(offers.get(harness.id) ?? []), { host, harness }])
      }
    }
  }

  return [...offers.values()].toSorted((a, b) => a[0].harness.name.localeCompare(b[0].harness.name))
})

let offers = $state<Offer[]>([])

let pickedHost = $state("")

const shown = $derived(offers.find(o => o.host.id === pickedHost) ?? offers[0] ?? null)

let open = $state(false)

let done = $state<{ name: string; login: string | null } | null>(null)

const matching = (list: Offer[][]) => {
  const needle = query.trim().toLowerCase()

  return needle
    ? list.filter(([{ harness: a }]) =>
        [a.id, a.name, describeHarness(a)].some(v => v.toLowerCase().includes(needle)),
      )
    : list
}

const keyOf = (host: HostEntry, harness: Available) => `${host.id}:${harness.id}`

const requirement = (harness: Available) =>
  harness.requires === "node"
    ? m.harness_requires_node()
    : harness.requires === "uv"
      ? m.harness_requires_uv()
      : m.harness_unavailable()

const install = (host: HostEntry, harness: Available) => {
  done = null
  open = false

  return attempt.run(async () => {
    busy = keyOf(host, harness)

    try {
      await host.view.install(harness.id)

      const login = host.view.state?.available.find(a => a.id === harness.id)?.login ?? null

      done = { name: harness.name, login }
    } finally {
      busy = null
    }
  })
}

const show = (list: Offer[]) => {
  offers = list
  pickedHost = list[0]?.host.id ?? ""
  open = true
}
</script>

<div class="@container flex flex-col gap-6">
  <div class="flex items-center gap-2">
    <IconButton icon="lucide:chevron-left" label={m.harness_back()} onclick={onback} />
    <IconInput
      class={["min-w-0 flex-1", tab === "compare" && "invisible"]}
      icon="lucide:search"
      label={m.harness_search()}
      placeholder={m.harness_search()}
      type="search"
      ghost={false}
      bind:value={query}
    />
  </div>

  <Segmented label={m.harness_browser()} items={TABS} value={tab} onpick={id => (tab = id)} />

  {#if tab === "compare"}
    <HarnessAdvisor />
  {:else if hosts.length === 0}
    <EmptyState
      icon="lucide:monitor-off"
      title={m.harness_no_hosts_title()}
      text={m.harness_no_hosts_text()}
    />
  {:else}
    {#if done}
      <div role="status" class="alert alert-info alert-soft text-sm">
        <Icon icon="lucide:circle-check" class="size-4 self-start" />
        <div class="flex min-w-0 flex-col gap-2">
          <p>{m.harness_installed({ name: done.name })}</p>
          {#if done.login}
            <p>{m.harness_login_hint()}</p>
            {@render command(done.login)}
          {/if}
        </div>
      </div>
    {/if}
    <ul class="grid grid-cols-1 gap-2 @lg:grid-cols-2">
      {#each matching(catalog) as list (list[0].harness.id)}
        {@const a = list[0].harness}
        {@const installing = list.find(o => busy === keyOf(o.host, o.harness))}
        <li class="min-w-0">
          <button
            type="button"
            class={[
              "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-box px-3 py-2.5",
              "border border-base-300 bg-base-100 text-start",
              "transition-colors duration-140 hover:bg-base-content/5",
            ]}
            onclick={() => show(list)}
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-field bg-base-200">
              <Icon icon={brandIcon(a.id)} class="size-5" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 truncate text-sm font-semibold">{a.name}</span>
                {#if installing}
                  <span class="loading loading-spinner loading-xs shrink-0"></span>
                {:else}
                  <span class="badge badge-ghost badge-xs shrink-0 whitespace-nowrap">
                    {a.state === "missing" ? requirement(a) : STATES[a.state]()}
                  </span>
                {/if}
              </span>
              <span
                class="min-w-0 truncate text-xs text-base-content/60"
                title={installing ? installing.host.view.installLog[a.id] : describeHarness(a)}
              >
                {installing
                  ? (installing.host.view.installLog[a.id] ?? m.harness_installing())
                  : describeHarness(a)}
              </span>
            </span>
          </button>
        </li>
      {:else}
        <li class="@lg:col-span-2">
          <EmptyState icon="lucide:search-x" text={m.harness_no_match()} />
        </li>
      {/each}
    </ul>
  {/if}
</div>
<ErrorAlert message={attempt.failure} />

<Modal bind:open label={shown?.harness.name ?? ""} class="max-w-lg">
  {#if shown}
    {@const { host, harness } = shown}
    <div class="flex items-start gap-3 p-5">
      <span class="grid size-11 shrink-0 place-items-center rounded-field bg-base-200">
        <Icon icon={brandIcon(harness.id)} class="size-6" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 class="flex min-w-0 items-baseline gap-2">
          <span class="truncate text-base font-semibold">{harness.name}</span>
          {#if harness.version}
            <span class="text-xs text-base-content/50 tabular-nums">{harness.version}</span>
          {/if}
        </h2>
        {#if describeHarness(harness)}
          <p class="text-sm text-base-content/70">{describeHarness(harness)}</p>
        {/if}
      </div>
    </div>
    <div class="flex flex-col gap-3 px-5 pb-2">
      {#if offers.length > 1}
        <Select
          class="w-full"
          label={m.spaces_host()}
          options={offers.map(o => ({ value: o.host.id, label: o.host.name }))}
          bind:value={pickedHost}
        />
      {/if}
      {#if harness.website || harness.repository}
        <div class="flex flex-wrap gap-2">
          {#if harness.website}
            {@render link(harness.website, "lucide:globe", m.harness_website())}
          {/if}
          {#if harness.repository}
            {@render link(harness.repository, "lucide:github", m.harness_source())}
          {/if}
        </div>
      {/if}
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2 p-5">
      {#if harness.state === "missing"}
        <span class="text-sm text-base-content/60">
          {harness.requires === "node"
            ? m.harness_requires_node_hint()
            : harness.requires === "uv"
              ? m.harness_requires_uv_hint()
              : m.harness_unavailable_hint()}
        </span>
      {:else}
        <span class="min-w-0 flex-1 text-sm text-base-content/60">{STATES[harness.state]()}</span>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={busy !== null}
          onclick={() => install(host, harness)}
        >
          <Icon icon="lucide:download" class="size-4" />
          {m.harness_install()}
        </button>
      {/if}
    </div>
  {/if}
</Modal>

{#snippet command(text: string)}
  <div class="flex min-w-0 items-center gap-1 rounded-field border border-base-300 bg-base-300/50 px-2 py-1">
    <code class="min-w-0 flex-1 break-all text-xs">{text}</code>
    <CopyButton {text} />
  </div>
{/snippet}

{#snippet link(href: string, icon: string, label: string)}
  <a class="btn btn-sm" {href} target="_blank" rel="noreferrer">
    <Icon {icon} class="size-4" />
    {label}
  </a>
{/snippet}
