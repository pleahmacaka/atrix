<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import {
  COMMANDS,
  type CommandId,
  hintOf,
  usable,
} from "../../store/commands"
import type { Explorer } from "../../store/explorer.svelte"

let {
  id,
  explorer,
  text = false,
  pressed,
  spin = false,
}: {
  id: CommandId
  explorer: Explorer
  text?: boolean
  pressed?: boolean
  spin?: boolean
} = $props()

const command = $derived(COMMANDS[id])

const label = $derived(command.label())

const hint = $derived(hintOf(id))

const title = $derived(hint ? `${label} (${hint})` : label)
</script>

{#if text}
  <button
    type="button"
    class="btn btn-ghost btn-sm shrink-0 gap-2 px-2.5 font-normal"
    {title}
    disabled={!usable(id, explorer)}
    onclick={() => command.run(explorer)}
  >
    <Icon icon={command.icon} class="size-4 shrink-0" />
    <span class="whitespace-nowrap">{label}</span>
  </button>
{:else}
  <IconButton
    icon={command.icon}
    {label}
    {title}
    aria-pressed={pressed}
    iconClass={["size-4", spin && "animate-spin"]}
    class={["shrink-0", pressed && "bg-primary/8 text-primary"]}
    disabled={!usable(id, explorer)}
    onclick={() => command.run(explorer)}
  />
{/if}
