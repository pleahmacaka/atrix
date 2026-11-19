<script lang="ts">
import Icon from "@iconify/svelte"
import { agents, openAgent, prompts, providerOf } from "#lib/agents/agents.svelte.ts"
import { PART_ICONS } from "#lib/agents/compose.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { PartKind, StoredAgent } from "#lib/store/local.svelte.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"

const SECTIONS: { kind: PartKind; title: () => string; add: () => string; empty: () => string }[] = [
  { kind: "instruction", title: m.instructions_title, add: m.instruction_new, empty: m.instructions_empty },
  { kind: "prompt", title: m.prompts_title, add: m.prompt_new, empty: m.prompts_empty },
  { kind: "variable", title: m.variables_title, add: m.variable_new, empty: m.variables_empty },
]

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
        "group flex items-center gap-3 rounded-field px-2 py-2 transition-colors",
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
        class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        disabled={!provider}
        onclick={() => message(agent)}
      />
    </div>
  {:else}
    <EmptyState icon="lucide:contact-round" text={m.agents_empty()} class="py-6" />
  {/each}
  {#each SECTIONS as section (section.kind)}
    <div class="mt-3 flex items-center gap-1 px-2">
      <h3 class="min-w-0 flex-1 text-xs font-medium text-base-content/60">{section.title()}</h3>
      <IconButton
        icon="lucide:plus"
        label={section.add()}
        class="shrink-0"
        onclick={() => {
          nav.agent = `prompt:new:${section.kind}`
        }}
      />
    </div>
    {#each prompts.of(section.kind) as prompt (prompt.id)}
      {@const id = `prompt:${prompt.id}`}
      <button
        type="button"
        class={[
          "flex min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-start text-sm",
          "transition-colors",
          nav.agent === id ? "bg-primary/8 text-primary" : "hover:bg-base-content/5",
        ]}
        aria-current={nav.agent === id ? "page" : undefined}
        onclick={() => {
          nav.agent = id
        }}
      >
        <Icon icon={PART_ICONS[section.kind]} class="size-4 shrink-0 opacity-70" />
        <span class="min-w-0 flex-1 truncate">
          {prompt.name}<span class="text-base-content/45">.{section.kind}</span>
        </span>
      </button>
    {:else}
      <p class="px-2 py-1 text-xs text-base-content/50">{section.empty()}</p>
    {/each}
  {/each}
  <ErrorAlert message={attempt.failure} />
</div>
