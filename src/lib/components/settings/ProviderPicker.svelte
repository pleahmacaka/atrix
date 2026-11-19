<script lang="ts">
import { untrack } from "svelte"
import { type ProviderKind, servesKind } from "#lib/acp/provider.ts"
import Select from "#lib/components/ui/Select.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { DEFAULT_PROVIDER, type HarnessInfo, type ProviderChoice } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways, findGateway } from "#lib/store/gatewayCatalog.ts"
import { gatewayIcon } from "#lib/store/gateways.svelte.ts"

let {
  host,
  harness = null,
  kind = null,
  run,
  apply,
}: {
  host: HostView
  harness?: HarnessInfo | null
  kind?: ProviderKind | null
  run: (work: () => Promise<unknown>) => void
  apply: (choice: ProviderChoice | null) => Promise<unknown>
} = $props()

const INHERIT = ""

const NATIVE = "native"

const fieldsOf = (choice: ProviderChoice | null | undefined) =>
  choice?.source === "native"
    ? { gateway: NATIVE, model: "" }
    : { gateway: choice?.gateway ?? INHERIT, model: choice?.model ?? "" }

const saved = $derived(
  !harness
    ? fieldsOf(host.state?.defaultProvider)
    : harness.providerSource === "default"
      ? fieldsOf(null)
      : fieldsOf(harness.provider),
)

let gateway = $state(untrack(() => saved.gateway))

let model = $state(untrack(() => saved.model))

const fallback = $derived(host.state?.defaultProvider ?? null)

const fallbackGateway = $derived(fallback?.source === "gateway" ? findGateway(fallback.gateway) : undefined)

const usable = $derived(!!fallbackGateway && !!kind && servesKind(kind, fallbackGateway))

const gateways = $derived(activeGateways().filter(g => !harness || (kind && servesKind(kind, g))))

const picked = $derived(gateways.find(g => g.id === gateway))

const inheritDetail = $derived(
  !fallbackGateway
    ? m.harness_provider_off()
    : usable
      ? m.harness_provider_fallback({ gateway: fallbackGateway.name, model: fieldsOf(fallback).model })
      : m.harness_provider_unusable(),
)

const options = $derived([
  harness
    ? { value: INHERIT, label: m.harness_provider_inherit(), detail: inheritDetail, icon: "lucide:arrow-down-to-line" }
    : { value: INHERIT, label: m.harness_provider_off(), icon: "lucide:circle-off" },
  ...gateways.map(g => ({ value: g.id, label: g.name, icon: gatewayIcon(g) })),
  ...(harness ? [{ value: NATIVE, label: m.harness_provider_native(), icon: "lucide:house" }] : []),
])

const dirty = $derived(gateway !== saved.gateway || (!!picked && model.trim() !== saved.model))

const choice = (): ProviderChoice | null =>
  picked ? { source: "gateway", gateway: picked.id, model: model.trim() } : gateway === NATIVE ? { source: "native" } : null

const save = () => run(() => apply(choice()))
</script>

<form
  class="flex min-w-0 flex-wrap items-center justify-end gap-2"
  onsubmit={e => {
    e.preventDefault()
    save()
  }}
>
  <Select
    class="w-52 max-sm:w-full"
    label={harness ? m.harness_provider() : m.harness_default_provider()}
    {options}
    bind:value={gateway}
  />
  {#if picked}
    <input
      class="input input-sm w-52 max-sm:w-full"
      list={`models-${harness?.id ?? DEFAULT_PROVIDER}`}
      placeholder={m.harness_provider_model()}
      aria-label={m.harness_provider_model()}
      bind:value={model}
    />
    <datalist id={`models-${harness?.id ?? DEFAULT_PROVIDER}`}>
      {#each picked.models ?? [] as id (id)}
        <option value={id}></option>
      {/each}
    </datalist>
  {/if}
  <button type="submit" class="btn btn-primary btn-sm" disabled={!dirty || (!!picked && !model.trim())}>
    {m.common_save()}
  </button>
</form>
{#if harness && picked && kind === "claude"}
  <p class="w-full text-end text-xs text-warning">{m.harness_provider_browser()}</p>
{/if}