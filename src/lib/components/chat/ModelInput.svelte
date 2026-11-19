<script lang="ts">
import Icon from "@iconify/svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import { m } from "#lib/paraglide/messages.js"
import { modelIcon } from "#lib/store/gateways.svelte.ts"

let {
  gateway,
  value = $bindable(),
  onchange,
}: { gateway: string; value: string; onchange?: () => void } = $props()

let ids = $state<string[]>([])

const load = async () => {
  if (ids.length > 0) {
    return
  }

  const { modelIds } = await import("#lib/chat/live.svelte.ts")

  ids = await modelIds(gateway)
}

const choices = $derived(ids.map(id => ({ value: id, name: id, icon: modelIcon(id) })))

const pick = (id: string) => {
  value = id
  onchange?.()
}

$effect(() => {
  load()
})
</script>

{#if ids.length > 0}
  <IconSelect icon="lucide:cpu" label={m.chat_model()} {value} {choices} onchange={pick} />
{:else}
  <label class="input input-ghost input-sm w-60 min-w-0 max-sm:w-full" title={m.chat_model()}>
    <Icon icon="lucide:cpu" class="size-4 shrink-0 opacity-60" />
    <input class="min-w-0 grow" aria-label={m.chat_model()} bind:value {onchange} onfocus={load} />
  </label>
{/if}
