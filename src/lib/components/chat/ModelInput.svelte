<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  gateway,
  value = $bindable(),
  onchange,
}: { gateway: string; value: string; onchange?: () => void } = $props()

const uid = $props.id()

let ids = $state<string[]>([])

const load = async () => {
  if (ids.length > 0) {
    return
  }

  const { modelIds } = await import("#lib/chat/live.svelte.ts")

  ids = await modelIds(gateway)
}
</script>

<label class="input input-ghost input-sm w-60 min-w-0" title={m.chat_model()}>
  <Icon icon="lucide:cpu" class="size-4 shrink-0 opacity-60" />
  <input
    class="min-w-0 grow"
    list="{uid}-models"
    aria-label={m.chat_model()}
    bind:value
    onfocus={load}
    {onchange}
  />
</label>
<datalist id="{uid}-models">
  {#each ids as id (id)}
    <option value={id}></option>
  {/each}
</datalist>
