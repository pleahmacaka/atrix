<script lang="ts">
import Icon from "@iconify/svelte"
import { agents, openAgent, providerOf } from "#lib/agents/agents.svelte.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { StoredAgent } from "#lib/store/local.svelte.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"

const attempt = new Attempt()

let filter = $state("")

const shown = $derived(
  agents.list.filter(a => a.name.toLowerCase().includes(filter.trim().toLowerCase())),
)

const message = (agent: StoredAgent) =>
  attempt.run(async () => {
    const opened = await openAgent(agent)

    goPage("chat")
    openConversation(opened)
  })
</script>

<div class="flex flex-col gap-1 px-2 pb-2">
  <SearchField bind:value={filter} placeholder={m.agents_search()} class="mb-1" />
  {#each shown as agent (agent.id)}
    {@const provider = providerOf(agent)}
    <div
      class={[
        "group flex items-center gap-3 rounded-field px-2 py-2 transition-colors duration-140",
        nav.agent === agent.id ? "bg-primary/8" : "hover:bg-base-content/5",
      ]}
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-start"
        aria-current={nav.agent === agent.id ? "page" : undefined}
        onclick={() => {
          nav.agent = agent.id
        }}
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-base-200">
          <Icon icon={provider?.icon ?? "lucide:bot"} class={["size-5", !provider && "opacity-40"]} />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span
            class={["truncate text-sm font-medium", nav.agent === agent.id && "text-primary"]}
          >
            {agent.name}
          </span>
          <span class="truncate text-xs text-base-content/55">
            {provider ? [provider.label, agent.model].filter(Boolean).join(", ") : m.agent_provider_missing()}
          </span>
        </span>
      </button>
      <IconButton
        icon="lucide:message-square-plus"
        label={m.agents_message({ name: agent.name })}
        class="shrink-0 opacity-0 transition-opacity duration-140 group-hover:opacity-100 focus-visible:opacity-100"
        disabled={!provider}
        onclick={() => message(agent)}
      />
    </div>
  {:else}
    <EmptyState icon="lucide:contact-round" text={m.agents_empty()} class="py-6" />
  {/each}
  <ErrorAlert message={attempt.failure} />
</div>
