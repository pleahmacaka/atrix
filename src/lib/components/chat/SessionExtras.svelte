<script lang="ts">
import { handoff } from "#lib/chat/handoff.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigChoice, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { OPTION_ICONS } from "./models.ts"

let {
  host,
  view,
  elsewhere,
  attempt,
}: {
  host: HostView
  view: SessionView
  elsewhere: boolean
  attempt: (work: () => Promise<unknown>) => Promise<boolean>
} = $props()

const options = $derived(
  view.config.filter(o => o.category !== "model" && o.category !== "thought_level"),
)

const others = $derived(
  elsewhere
    ? []
    : (host.state?.harnesses.filter(h => h.enabled && h.id !== view.harness) ?? []),
)

const choicesOf = (option: ConfigChoice) =>
  option.values.map(v => ({ value: v.value, name: v.name }))
</script>

{#if options.length > 0}
  <MenuLabel text={m.chat_options()} />
  {#each options as option (option.id)}
    <div class="flex min-w-0 items-center gap-2 px-2 py-1 text-sm">
      <span class="min-w-0 flex-1 truncate" title={option.name}>{option.name}</span>
      <IconSelect
        icon={OPTION_ICONS[option.category ?? ""] ?? "lucide:settings-2"}
        label={option.name}
        ghost={false}
        value={option.current}
        choices={choicesOf(option)}
        onchange={value => attempt(() => host.configure(view.id, option.id, value))}
      />
    </div>
  {/each}
{/if}
{#if others.length > 0}
  <MenuLabel text={m.chat_switch_harness()} />
  {#each others as harness (harness.id)}
    <MenuItem
      icon={brandIcon(harness.base)}
      label={harness.name}
      onclick={() => attempt(() => handoff(host, view, harness.id))}
    />
  {/each}
{/if}
