<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { recents } from "#lib/store/recent.ts"

let {
  host,
  exclude,
  onpick,
  onclose,
}: {
  host: string | null
  exclude: string[]
  onpick: (id: string) => Promise<unknown>
  onclose: () => void
} = $props()

const attempt = new Attempt()

let query = $state("")

const sessions = $derived(
  recents().filter(
    r =>
      r.current.kind === "session" &&
      r.current.host === host &&
      !exclude.includes(r.current.id) &&
      r.title.toLowerCase().includes(query.trim().toLowerCase()),
  ),
)

const pick = (id: string) =>
  attempt.run(async () => {
    const view = host ? hostById(host) : null

    if (view && !view.views[id]) {
      await view.open(id)
    }

    await onpick(id)
    onclose()
  })
</script>

<Modal
  bind:open={() => host !== null, open => !open && onclose()}
  label={m.space_add_session()}
  class="max-w-lg"
>
  <div class="flex flex-col gap-3 p-4">
    <h2 class="text-base font-semibold">{m.space_add_session()}</h2>
    <input
      class="input w-full"
      placeholder={m.common_search()}
      aria-label={m.common_search()}
      bind:value={query}
      {@attach el => el.focus()}
    />
    <ErrorAlert message={attempt.failure} />
    <ul class="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
      {#each sessions as item (item.key)}
        <li>
          <button
            type="button"
            class={[
              "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-start text-sm",
              "transition-colors duration-140 hover:bg-base-content/8 disabled:cursor-not-allowed",
            ]}
            disabled={attempt.busy}
            onclick={() => pick(item.current.id)}
          >
            <Icon icon={item.icon} class="size-4 shrink-0 opacity-70" />
            <span class="min-w-0 flex-1 truncate">{item.title}</span>
            {#if item.live}
              <span class="size-1.5 shrink-0 rounded-full bg-success/70"></span>
            {/if}
          </button>
        </li>
      {:else}
        <li class="px-2 py-6 text-center text-sm text-base-content/50">{m.chat_none()}</li>
      {/each}
    </ul>
  </div>
</Modal>
