<script lang="ts">
import Icon from "@iconify/svelte"
import { channels, settleRequest } from "#lib/channels/store.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let { botTitle }: { botTitle: (id: string) => string } = $props()
</script>

{#if channels.requests.length > 0}
  <ul class="flex flex-col px-2 pb-2">
    {#each channels.requests as request (`${request.bot}:${request.userId}`)}
      <li class="flex min-w-0 items-center gap-3 rounded-field px-2 py-1.5">
        <Icon icon="lucide:user-plus" class="size-4 shrink-0 text-base-content/60" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm font-medium">{request.name}</span>
          <span class="truncate text-xs text-base-content/60 tabular-nums">
            {m.bot_request_detail({ bot: botTitle(request.bot), user: request.userId })}
          </span>
        </span>
        <button type="button" class="btn btn-sm btn-primary" onclick={() => settleRequest(request, true)}>
          {m.bot_grant()}
        </button>
        <button type="button" class="btn btn-sm btn-ghost" onclick={() => settleRequest(request, false)}>
          {m.bot_decline()}
        </button>
      </li>
    {/each}
  </ul>
{/if}