<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import {
  agents,
  fromTemplate,
  openAgent,
  prompts,
  providerOf,
  providers,
  TEMPLATES,
} from "#lib/agents/agents.svelte.ts"
import { PART_ICONS, variableNamed } from "#lib/agents/compose.ts"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import { efforts, terminalChoices } from "#lib/components/chat/models.ts"
import AgentBuilder from "#lib/components/harness/AgentBuilder.svelte"
import AgentDeps from "#lib/components/harness/AgentDeps.svelte"
import ProviderSelect from "#lib/components/harness/ProviderSelect.svelte"
import RichEditor from "#lib/components/knowledge/RichEditor.svelte"
import FolderPicker from "#lib/components/shell/FolderPicker.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import { BUILTIN_VARIABLES, variablesIn } from "#lib/knowledge/variable.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local, type StoredAgent } from "#lib/store/local.svelte.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"

type Draft = Omit<StoredAgent, "id" | "at"> & { id: string | null }

const attempt = new Attempt()

const existing = $derived(nav.agent && nav.agent !== "new" ? agents.find(nav.agent) : undefined)

const blank = (): Draft => ({ id: null, ...fromTemplate(TEMPLATES[0]) })

let draft = $state<Draft>(blank())

let manual = $state(false)

let revision = $state(0)

$effect(() => {
  const agent = existing

  draft = agent ? { ...agent, requires: agent.requires ?? {} } : untrack(blank)
  manual = false
})

const building = $derived(!existing && !manual)

const blocks = $derived([...prompts.of("instruction"), ...prompts.of("prompt")])

const include = (name: string) => {
  draft.instructions = [draft.instructions.trim(), `{{#${name}}}`].filter(Boolean).join("\n\n")
  revision++
}

const custom = $derived(
  variablesIn(prompts.expand(draft.instructions)).filter(name => !BUILTIN_VARIABLES.includes(name)),
)

const options = $derived(providers())

const provider = $derived(options.find(p => p.key === draft.provider))

const claude = $derived(provider?.kind === "harness" && provider.base === "claude-acp")

const save = () =>
  attempt.run(async () => {
    nav.agent = await agents.save({ ...draft, name: draft.name.trim() })
  })

const start = () =>
  attempt.run(async () => {
    const id = draft.id ?? (await agents.save({ ...draft, name: draft.name.trim() }))
    const agent = agents.find(id)

    if (!agent) {
      return
    }

    const opened = await openAgent(agent)

    goPage("chat")
    openConversation(opened)
  })

const remove = () =>
  attempt.run(async () => {
    if (draft.id) {
      await agents.remove(draft.id)
    }

    nav.agent = null
  })
</script>

{#if building}
<AgentBuilder
  onapply={next => {
    draft = next
    manual = true
    revision++
  }}
  onmanual={() => {
    manual = true
  }}
/>
{:else}
<section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
    {#if !existing}
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <h3 class="min-w-0 flex-1 text-xs font-medium text-base-content/60">{m.agent_templates()}</h3>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onclick={() => {
              manual = false
            }}
          >
            <Icon icon="lucide:wand-sparkles" class="size-4" />
            {m.builder_back()}
          </button>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each TEMPLATES as template (template.id)}
            <button
              type="button"
              class="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 text-start transition-colors duration-140 hover:bg-base-content/5"
              onclick={() => {
                draft = { id: null, ...fromTemplate(template) }
                revision++
              }}
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon icon={template.icon} class="size-5" />
              </span>
              <span class="text-sm font-medium">{template.name()}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <form
      class="flex flex-col gap-2"
      onsubmit={e => {
        e.preventDefault()
        save()
      }}
    >
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <IconInput
          icon="lucide:tag"
          label={m.agent_name()}
          placeholder={m.agent_name()}
          ghost={false}
          bind:value={draft.name}
        />
        <ProviderSelect
          {options}
          label={m.agent_provider()}
          value={draft.provider}
          onchange={key => {
            const next = options.find(p => p.key === key)

            draft.provider = key
            draft.model = next?.kind === "gateway" ? next.model : ""
          }}
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if provider?.kind === "gateway"}
          <ModelInput gateway={provider.gateway} bind:value={draft.model} />
        {:else if claude}
          <IconSelect
            icon="lucide:cpu"
            label={m.chat_model()}
            ghost={false}
            value={draft.model}
            choices={terminalChoices(undefined, [])}
            onchange={value => {
              draft.model = value
            }}
          />
        {/if}
        {#if provider?.kind === "harness"}
          <IconSelect
            icon="lucide:brain"
            label={m.chat_effort()}
            ghost={false}
            value={draft.effort}
            choices={efforts()}
            onchange={value => {
              draft.effort = value
            }}
          />
          <FolderPicker
            host={hostById(provider.host)}
            value={draft.cwd || hostById(provider.host)?.state?.home || ""}
            onpick={cwd => {
              draft.cwd = cwd
            }}
          />
        {/if}
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="min-w-0 flex-1 px-1 text-xs text-base-content/60">{m.agent_instructions()}</span>
          {#if blocks.length}
            <IconSelect
              icon="lucide:file-plus"
              label={m.insert_part()}
              value=""
              choices={blocks.map(p => ({
                value: p.name,
                name: p.name,
                detail: p.kind === "instruction" ? m.instructions_title() : m.prompts_title(),
                icon: PART_ICONS[p.kind ?? "prompt"],
              }))}
              onchange={include}
            />
          {/if}
        </div>
        <div class="rounded-box border border-base-300 bg-base-100 px-4 py-3">
          {#key `${draft.id}:${revision}`}
            <RichEditor
              markdown={draft.instructions}
              editable
              compact
              placeholder={m.agent_instructions_hint()}
              variables={Object.keys(draft.variables ?? {})}
              title={() => null}
              open={() => {}}
              onchange={text => {
                draft.instructions = text
              }}
            />
          {/key}
        </div>
      </div>
      {#if custom.length}
        <div class="flex flex-col gap-1">
          <span class="px-1 text-xs text-base-content/60">{m.agent_variables()}</span>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {#each custom as name (name)}
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="px-1 text-xs text-primary">{`{{${name}}}`}</span>
                <IconInput
                  icon="lucide:braces"
                  label={name}
                  placeholder={variableNamed(local.data.prompts, name)?.text ?? name}
                  ghost={false}
                  value={draft.variables?.[name] ?? ""}
                  oninput={e => {
                    const { [name]: _, ...rest } = draft.variables ?? {}
                    const value = e.currentTarget.value
                    const shared = !value && variableNamed(local.data.prompts, name)

                    draft.variables = shared ? rest : { ...rest, [name]: value }
                  }}
                />
              </div>
            {/each}
          </div>
        </div>
      {/if}
      <AgentDeps {provider} instructions={draft.instructions} bind:requires={draft.requires} />
      <div class="flex items-center justify-end gap-2">
        {#if draft.id}
          <ConfirmButton label={m.common_delete()} labeled onconfirm={remove} />
        {/if}
        <button
          type="button"
          class="btn btn-sm"
          disabled={attempt.busy || !draft.name.trim() || !providerOf(draft)}
          onclick={start}
        >
          <Icon icon="lucide:message-square-plus" class="size-4" />
          {m.agent_start_chat()}
        </button>
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={attempt.busy || !draft.name.trim() || !draft.provider}
        >
          <Icon icon="lucide:check" class="size-4" />
          {m.agent_save()}
        </button>
      </div>
    </form>
    <ErrorAlert message={attempt.failure} />
  </div>
</section>
{/if}
