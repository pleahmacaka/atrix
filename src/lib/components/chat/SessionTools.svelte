<script lang="ts">
import Icon from "@iconify/svelte"
import { olderModels } from "#lib/chat/versions.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigChoice, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import ContextRing from "./ContextRing.svelte"
import ModelEffort from "./ModelEffort.svelte"
import ModelLabel from "./ModelLabel.svelte"
import {
  efforts,
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

const configured = $derived(view.config.length > 0)

const info = $derived(host.state?.harnesses.find(h => h.id === view.harness))

const claude = $derived(info?.base === "claude-acp")

const EFFORTS = efforts()

let effort = $state("")

const idle = () =>
  new Promise<void>(resolve => {
    const stop = $effect.root(() => {
      $effect(() => {
        if (!host.views[view.id]?.running) {
          resolve()
          queueMicrotask(() => stop())
        }
      })
    })
  })

const command = async (text: string) => {
  await idle()
  send(text)
}

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

const knownModels = $derived(
  Object.values(host.views).flatMap(
    v => v?.config.filter(o => o.category === "model").flatMap(o => o.values) ?? [],
  ),
)

</script>


{#if !configured && claude && (elsewhere || view.model)}
  <ModelEffort
    models={terminalChoices(view.model, knownModels)}
    model={terminalModel(view.model)}
    efforts={EFFORTS}
    {effort}
    title={view.model}
    onmodel={alias =>
      elsewhere ? command(`/model ${alias}`) : attempt(() => host.configure(view.id, "model", alias))}
    oneffort={level => {
      const before = effort

      effort = level

      if (!level) {
        return
      }

      if (elsewhere) {
        command(`/effort ${level}`)
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
<ContextRing {view} {claude} />
