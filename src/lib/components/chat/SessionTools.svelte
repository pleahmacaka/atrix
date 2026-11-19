<script lang="ts">
import Icon from "@iconify/svelte"
import { handoff } from "#lib/chat/handoff.ts"
import { olderModels } from "#lib/chat/versions.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigChoice, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import ContextRing from "./ContextRing.svelte"
import ModelEffort from "./ModelEffort.svelte"
import ModelLabel from "./ModelLabel.svelte"
import {
  efforts,
  OPTION_ICONS,
  PRIMARY,
  terminalChoices,
  terminalModel,
} from "./models.ts"

let {
  host,
  view,
  elsewhere,
  attempt,
  send,
}: {
  host: HostView
  view: SessionView
  elsewhere: boolean
  attempt: (work: () => Promise<unknown>) => Promise<boolean>
  send: (text: string) => void
} = $props()

const isPrimary = (option: ConfigChoice) => PRIMARY.includes(option.category ?? "")

const configured = $derived(view.config.length > 0)

const primary = $derived(view.config.filter(isPrimary))

const secondary = $derived(view.config.filter(o => !isPrimary(o)))

const info = $derived(host.state?.harnesses.find(h => h.id === view.harness))

const claude = $derived(info?.base === "claude-acp")

const EFFORTS = efforts()

let effort = $state("")

const modelOption = $derived(view.config.find(o => o.category === "model"))

const effortOption = $derived(view.config.find(o => o.category === "thought_level"))

const choicesOf = (option: ConfigChoice) => {
  const older = option.category === "model" ? olderModels(option.values) : null

  return option.values.map(v => ({
    value: v.value,
    name: v.name,
    older: older?.has(v.name),
  }))
}

const others = $derived(
  host.state?.harnesses.filter(h => h.enabled && h.id !== view.harness) ?? [],
)

let switching = $state(false)

const knownModels = $derived(
  Object.values(host.views).flatMap(
    v => v?.config.filter(o => o.category === "model").flatMap(o => o.values) ?? [],
  ),
)

</script>

{#snippet picker(option: ConfigChoice, ghost: boolean)}
  <IconSelect
    icon={OPTION_ICONS[option.category ?? ""] ?? "lucide:settings-2"}
    label={option.name}
    {ghost}
    value={option.current}
    choices={choicesOf(option)}
    onchange={value => attempt(() => host.configure(view.id, option.id, value))}
  />
{/snippet}

{#if !configured && claude && (elsewhere || view.model)}
  <ModelEffort
    models={terminalChoices(view.model, knownModels)}
    model={terminalModel(view.model)}
    efforts={EFFORTS}
    {effort}
    title={view.model}
    onmodel={alias =>
      elsewhere ? send(`/model ${alias}`) : attempt(() => host.configure(view.id, "model", alias))}
    oneffort={level => {
      const before = effort

      effort = level

      if (!level) {
        return
      }

      if (elsewhere) {
        send(`/effort ${level}`)
      } else {
        attempt(() => host.configure(view.id, "thought_level", level)).then(
          ok => {
            if (!ok) {
              effort = before
            }
          },
        )
      }
    }}
  />
{:else if !configured && view.model}
  <button
    type="button"
    class="btn btn-ghost btn-xs max-w-72 min-w-0 font-normal"
    title={view.model}
    aria-label={m.chat_model_load({ model: view.model })}
    disabled={elsewhere}
    onclick={() => attempt(() => host.attach(view.id))}
  >
    <ModelLabel name={view.model} />
    {#if !elsewhere}
      <Icon icon="lucide:chevron-down" class="size-3.5 shrink-0 opacity-60" />
    {/if}
  </button>
{:else if modelOption}
  <ModelEffort
    models={choicesOf(modelOption)}
    model={view.pinned ?? modelOption.current}
    locked={!!view.pinned}
    efforts={effortOption ? choicesOf(effortOption) : []}
    effort={effortOption?.current ?? ""}
    onmodel={value => attempt(() => host.configure(view.id, modelOption.id, value))}
    oneffort={value =>
      effortOption && attempt(() => host.configure(view.id, effortOption.id, value))}
  />
{/if}
{#if others.length > 0 && !elsewhere}
  <Popover label={m.chat_switch_harness()} placement="top-start" width="w-64" bind:open={switching}>
    {#snippet trigger(p)}
      <IconButton icon="lucide:arrow-left-right" label={m.chat_switch_harness()} {...p} />
    {/snippet}
    <div role="menu" tabindex="-1" class="flex max-h-80 flex-col overflow-y-auto" {@attach menuKeys}>
      {#each others as harness (harness.id)}
        <MenuItem
          icon={brandIcon(harness.base)}
          label={harness.name}
          onclick={() => {
            switching = false
            attempt(() => handoff(host, view, harness.id))
          }}
        />
      {/each}
    </div>
  </Popover>
{/if}
{#if view.shells?.length}
  {@const shells = view.shells}
  <Popover
    label={m.chat_shells({ count: shells.length })}
    placement="top-start"
    width="w-96"
    sheet
  >
    {#snippet trigger(p)}
      <button {...p} type="button" class="btn btn-ghost btn-xs font-normal">
        <Icon icon="lucide:square-terminal" class="size-4 opacity-60" />
        {m.chat_shells({ count: shells.length })}
      </button>
    {/snippet}
    {#each shells as shell (shell.id)}
      <div class="flex items-start gap-2 rounded-field px-2 py-1.5">
        <span class="loading loading-spinner loading-xs mt-0.5 shrink-0 text-info"></span>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate" title={shell.description || shell.command}>
            {shell.description || shell.command}
          </span>
          {#if shell.description}
            <span class="truncate text-xs text-base-content/55" title={shell.command}>
              {shell.command}
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </Popover>
{/if}
{#each primary.filter(o => o !== modelOption && o !== effortOption) as option (option.id)}
  {@render picker(option, true)}
{/each}
{#if secondary.length > 0}
  <Popover label={m.chat_options()} placement="top-start" width="w-80" sheet>
    {#snippet trigger(p)}
      <IconButton
        icon="lucide:sliders-horizontal"
        label={m.chat_options()}
        {...p}
      />
    {/snippet}
    <div class="flex flex-col gap-3 p-3">
      {#each secondary as option (option.id)}
        <div class="flex items-center gap-3">
          <span class="min-w-0 flex-1 truncate" title={option.name}>{option.name}</span>
          {@render picker(option, false)}
        </div>
      {/each}
    </div>
  </Popover>
{/if}
<ContextRing {view} {claude} />
