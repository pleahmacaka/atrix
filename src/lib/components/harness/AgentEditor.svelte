<script lang="ts">
import Icon from "@iconify/svelte"
import {
  agents,
  fromTemplate,
  openAgent,
  providerOf,
  providers,
  TEMPLATES,
} from "#lib/agents/agents.svelte.ts"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import { efforts, terminalChoices } from "#lib/components/chat/models.ts"
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
import type { StoredAgent } from "#lib/store/local.svelte.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"

type Draft = Omit<StoredAgent, "id" | "at"> & { id: string | null }

const attempt = new Attempt()

const existing = $derived(nav.agent && nav.agent !== "new" ? agents.find(nav.agent) : undefined)

const blank = (): Draft => ({ id: null, ...fromTemplate(TEMPLATES[0]) })

let draft = $state<Draft>(blank())

$effect(() => {
  const agent = existing

  draft = agent ? { ...agent } : blank()
})

let picked = $state("")

const custom = $derived(
  variablesIn(draft.instructions).filter(name => !BUILTIN_VARIABLES.includes(name)),
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

<section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
    {#if !existing}
      <div class="flex flex-col gap-2">
        <h3 class="text-xs font-medium text-base-content/60">{m.agent_templates()}</h3>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each TEMPLATES as template (template.id)}
            <button
              type="button"
              class="flex cursor-pointer items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 text-start transition-colors duration-140 hover:bg-base-content/5"
              onclick={() => {
                draft = { id: null, ...fromTemplate(template) }
                picked = template.id
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
        <IconSelect
          icon={provider?.icon ?? "lucide:server"}
          label={m.agent_provider()}
          ghost={false}
          class="w-full"
          value={draft.provider}
          groups={[
            {
              label: m.agent_provider_harness(),
              choices: options
                .filter(p => p.kind === "harness")
                .map(p => ({ value: p.key, name: p.label, detail: p.detail, icon: p.icon })),
            },
            {
              label: m.agent_provider_gateway(),
              choices: options
                .filter(p => p.kind === "gateway")
                .map(p => ({ value: p.key, name: p.label, icon: p.icon })),
            },
          ]}
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
        <span class="px-1 text-xs text-base-content/60">{m.agent_instructions()}</span>
        <div class="rounded-box border border-base-300 bg-base-100 px-4 py-3">
          {#key draft.id ?? picked}
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
                  placeholder={name}
                  ghost={false}
                  value={draft.variables?.[name] ?? ""}
                  oninput={e => {
                    draft.variables = { ...draft.variables, [name]: e.currentTarget.value }
                  }}
                />
              </div>
            {/each}
          </div>
        </div>
      {/if}
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
