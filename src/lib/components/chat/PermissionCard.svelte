<script lang="ts">
import Icon from "@iconify/svelte"
import type { Ask } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { CARD } from "./card.ts"

let { ask, onPermit }: { ask: Ask; onPermit: (optionId: string) => void } = $props()

const iconOf = (kind: string) =>
  kind.startsWith("allow")
    ? kind.endsWith("always")
      ? "lucide:check-check"
      : "lucide:check"
    : "lucide:x"
</script>

<section class={CARD} aria-label={m.chat_permission_title()}>
  <h3 class="mb-3 flex min-w-0 items-start gap-2 font-semibold">
    <Icon icon="lucide:shield-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
    <span class="min-w-0 break-words">{m.chat_permission({ title: ask.title })}</span>
  </h3>
  <div class="flex flex-wrap gap-2">
    {#each ask.options as option (option.optionId)}
      <button
        type="button"
        class={[
          "btn btn-sm",
          option.kind.startsWith("allow") ? "btn-primary" : "btn-ghost",
        ]}
        onclick={() => onPermit(option.optionId)}
      >
        <Icon icon={iconOf(option.kind)} class="size-4" />
        {option.name}
      </button>
    {/each}
  </div>
</section>
