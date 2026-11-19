<script lang="ts">
import type { Provider } from "#lib/agents/agents.svelte.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconSelect, { type Choice } from "#lib/components/ui/IconSelect.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  options,
  value,
  label,
  disabled = false,
  class: extra = "w-48 max-sm:w-full",
  onchange,
}: {
  options: Provider[]
  value: string
  label: string
  disabled?: boolean
  class?: string
  onchange: (key: string) => void
} = $props()

const attempt = new Attempt()

const selected = $derived(options.find(p => p.key === value))

const pending = $derived(selected?.kind === "harness" && selected.state !== "installed" ? selected : null)

const harnesses = (installed: boolean): Choice[] =>
  options.flatMap(p =>
    p.kind === "harness" && (p.state === "installed") === installed
      ? [{ value: p.key, name: p.label, detail: p.detail, icon: p.icon }]
      : [],
  )

const install = (host: string, harness: string) =>
  attempt.run(async () => {
    await hostById(host)?.install(harness)
  })
</script>

<div class="flex min-w-0 items-center gap-1">
  <IconSelect
    icon={selected?.icon ?? "lucide:server"}
    {label}
    {disabled}
    {onchange}
    {value}
    ghost={false}
    class={extra}
    groups={[
      { label: m.harness_group_installed(), choices: harnesses(true) },
      { label: m.harness_available(), choices: harnesses(false) },
      {
        label: m.agent_provider_gateway(),
        choices: options
          .filter(p => p.kind === "gateway")
          .map(p => ({ value: p.key, name: p.label, icon: p.icon })),
      },
    ]}
  />
  {#if pending}
    <IconButton
      icon={attempt.failure ? "lucide:triangle-alert" : "lucide:download"}
      label={m.harness_install()}
      title={attempt.failure ?? m.harness_install_tip()}
      tone={attempt.failure ? "warning" : "ghost"}
      busy={attempt.busy}
      disabled={disabled || attempt.busy}
      onclick={() => install(pending.host, pending.harness)}
    />
  {/if}
</div>
