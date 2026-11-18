<script lang="ts">
import { servesKind } from "#lib/acp/provider.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import Select from "#lib/components/ui/Select.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { HarnessInfo, HarnessKind } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways } from "#lib/store/gatewayCatalog.ts"
import { gatewayIcon } from "#lib/store/gateways.svelte.ts"

let {
  host,
  harness,
  kind,
  run,
}: {
  host: HostView
  harness: HarnessInfo
  kind: HarnessKind
  run: (work: () => Promise<unknown>) => void
} = $props()

const DEFAULT = ""

let open = $state(false)

let gateway = $state(DEFAULT)

let model = $state("")

let dirty = $state(false)

const toggle = (next: boolean) => {
  open = next

  if (next) {
    dirty = !!harness.provider && !harness.providerActive

    const saved = harness.provider?.gateway ?? DEFAULT

    gateway = gateways.some(g => g.id === saved) ? saved : DEFAULT
    model = harness.provider?.model ?? ""
  }
}

const gateways = $derived(activeGateways().filter(g => servesKind(kind, g)))

const picked = $derived(gateways.find(g => g.id === gateway))

const options = $derived([
  { value: DEFAULT, label: m.harness_provider_default(), icon: "lucide:house" },
  ...gateways.map(g => ({ value: g.id, label: g.name, icon: gatewayIcon(g) })),
])

const save = () => {
  open = false
  run(() =>
    host.setProvider(
      harness.id,
      picked && model.trim() ? { gateway: picked.id, model: model.trim() } : null,
    ),
  )
}
</script>

<Popover label={m.harness_provider()} placement="bottom-end" width="w-80" bind:open={() => open, toggle}>
  {#snippet trigger(p)}
    <IconButton
      icon={harness.provider ? "lucide:plug-zap" : "lucide:plug"}
      label={m.harness_provider()}
      tone={harness.provider && !harness.providerActive ? "warning" : undefined}
      {...p}
    />
  {/snippet}
  <form
    class="flex flex-col gap-3 p-3"
    onsubmit={e => {
      e.preventDefault()
      save()
    }}
  >
    {#if harness.provider && !harness.providerActive}
      <p class="text-xs text-warning">{m.harness_provider_inactive()}</p>
    {/if}
    <Select
      label={m.harness_provider()}
      {options}
      value={gateway}
      onchange={v => {
        gateway = v
        dirty = true
      }}
    />
    {#if picked}
      <input
        class="input input-sm w-full"
        list={`models-${harness.id}`}
        placeholder={m.harness_provider_model()}
        aria-label={m.harness_provider_model()}
        bind:value={model}
        oninput={() => (dirty = true)}
      />
      <datalist id={`models-${harness.id}`}>
        {#each picked.models ?? [] as id (id)}
          <option value={id}></option>
        {/each}
      </datalist>
      {#if kind === "claude"}
        <p class="text-xs text-warning">{m.harness_provider_browser()}</p>
      {/if}
    {:else if gateways.length === 0}
      <p class="text-xs text-base-content/60">{m.harness_provider_none()}</p>
    {/if}
    <button type="submit" class="btn btn-primary btn-sm" disabled={!dirty || (!!picked && !model.trim())}>
      {m.common_save()}
    </button>
  </form>
</Popover>
