<script lang="ts">
import type { Provider } from "#lib/agents/agents.svelte.ts"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  options,
  value,
  label,
  disabled = false,
  onchange,
}: {
  options: Provider[]
  value: string
  label: string
  disabled?: boolean
  onchange: (key: string) => void
} = $props()
</script>

<IconSelect
  icon={options.find(p => p.key === value)?.icon ?? "lucide:server"}
  {label}
  {disabled}
  {onchange}
  {value}
  ghost={false}
  class="w-full"
  groups={[
    {
      label: m.agent_provider_harness(),
      choices: options
        .filter(p => p.kind === "harness")
        .map(p => ({ value: p.key, name: p.label, detail: p.detail, icon: p.icon })),
    },
    {
      label: m.agent_provider_gateway(),
      choices: options
        .filter(p => p.kind === "gateway")
        .map(p => ({ value: p.key, name: p.label, icon: p.icon })),
    },
  ]}
/>
