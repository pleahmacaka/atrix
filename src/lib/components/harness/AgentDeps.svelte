<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { ATRIX_TOOLS } from "#lib/acp/toolNames.ts"
import {
  dependencies,
  type Inventory,
  inventoryOf,
  type Provider,
} from "#lib/agents/agents.svelte.ts"
import { DEP_KINDS, type Dep } from "#lib/agents/compose.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import type { Skill } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Requires } from "#lib/store/local.svelte.ts"
import RequireTags from "./RequireTags.svelte"

type Status = "ready" | "missing" | "installable" | "unverified" | "unsupported"

let {
  provider,
  instructions,
  requires = $bindable({}),
}: {
  provider: Provider | undefined
  instructions: string
  requires?: Requires
} = $props()

const STATUS: Record<Status, { label: () => string; tone: string }> = {
  ready: { label: m.dep_ready, tone: "badge-success" },
  missing: { label: m.dep_missing, tone: "badge-error" },
  installable: { label: m.dep_missing, tone: "badge-warning" },
  unverified: { label: m.dep_unverified, tone: "badge-neutral" },
  unsupported: { label: m.dep_unsupported, tone: "badge-error" },
}

const ATRIX_TOOL_SET = new Set<string>(ATRIX_TOOLS)

const ICONS: Record<Dep["kind"], string> = {
  skills: "lucide:sparkles",
  tools: "lucide:wrench",
  mcp: "lucide:plug",
}

const attempt = new Attempt()

const harness = $derived(provider?.kind === "harness" ? provider : null)

const harnessKey = $derived(harness?.key ?? null)

let inventory = $state<Inventory | null>(null)

let siblings = $state<{ harness: string; skills: Skill[] }[]>([])

let version = $state(0)

$effect(() => {
  void version

  const key = harnessKey
  const target = untrack(() => harness)
  const view = target && untrack(() => hostById(target.host))

  inventory = null
  siblings = []

  if (!key || !target || !view) {
    return
  }

  let live = true

  const loadInventory = async () => {
    try {
      const found = await inventoryOf(view, target.harness)

      if (live) {
        inventory = found
      }
    } catch {}
  }

  void loadInventory()

  const others = untrack(() => view.state?.harnesses ?? []).filter(
    h => h.id !== target.harness && h.kind,
  )

  Promise.allSettled(
    others.map(async h => ({ harness: h.id, skills: (await view.readHarness(h.id)).skills })),
  ).then(results => {
    if (live) {
      siblings = results.flatMap(r => (r.status === "fulfilled" ? [r.value] : []))
    }
  })

  return () => {
    live = false
  }
})

const deps = $derived(dependencies({ instructions, requires }))

const sourceOf = (name: string) =>
  siblings.flatMap(s => s.skills).find(skill => skill.name === name)

const statusOf = (dep: Dep): Status => {
  if (!harness) {
    return "unsupported"
  }

  if (dep.kind === "tools") {
    return ATRIX_TOOL_SET.has(dep.name) ? "ready" : "unverified"
  }

  if (!inventory) {
    return "unverified"
  }

  const have =
    dep.kind === "skills"
      ? inventory.skills.some(s => s.name === dep.name)
      : inventory.mcp.includes(dep.name)

  if (have) {
    return "ready"
  }

  return dep.kind === "skills" && sourceOf(dep.name) ? "installable" : "missing"
}

const install = (name: string) =>
  attempt.run(async () => {
    const source = sourceOf(name)
    const view = harness && hostById(harness.host)

    if (source && view && harness) {
      await view.writeSkill(harness.harness, name, source.content)
      version++
    }
  })
</script>

<div class="flex flex-col gap-2">
  <span class="px-1 text-xs text-base-content/60">{m.dependencies()}</span>
  {#if harness || DEP_KINDS.some(kind => requires[kind]?.length)}
    <RequireTags
      bind:value={requires}
      kinds={["skills", "tools", "mcp"]}
      suggest={{
        skills: [
          ...new Set([
            ...(inventory?.skills ?? []).map(s => s.name),
            ...siblings.flatMap(s => s.skills.map(skill => skill.name)),
          ]),
        ],
        mcp: inventory?.mcp ?? [],
      }}
    />
  {/if}
  {#if deps.length}
    <div class="flex flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2">
      {#each deps as dep (`${dep.kind}:${dep.name}`)}
        {@const status = statusOf(dep)}
        <div class="flex min-h-8 items-center gap-2 px-1 text-sm">
          <Icon icon={ICONS[dep.kind]} class="size-4 shrink-0 opacity-70" />
          <span class="min-w-0 truncate">{dep.name}</span>
          {#if dep.from.length}
            <span class="min-w-0 flex-1 truncate text-xs text-base-content/50">
              {m.dep_from({ names: dep.from.join(", ") })}
            </span>
          {:else}
            <span class="flex-1"></span>
          {/if}
          {#if status === "installable"}
            <button
              type="button"
              class="btn btn-xs"
              disabled={attempt.busy}
              onclick={() => install(dep.name)}
            >
              <Icon icon="lucide:download" class="size-3.5" />
              {m.dep_install()}
            </button>
          {/if}
          <span class={["badge badge-soft badge-sm shrink-0", STATUS[status].tone]}>
            {STATUS[status].label()}
          </span>
        </div>
      {/each}
    </div>
  {/if}
  <ErrorAlert message={attempt.failure} />
</div>
