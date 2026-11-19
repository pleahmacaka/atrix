<script lang="ts">
import Icon from "@iconify/svelte"
import { Composer, type ComposerProps, provideComposer } from "#lib/chat/composer.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { panes, usePane } from "#lib/store/panes.svelte.ts"
import CallBar from "./CallBar.svelte"
import { dock } from "./dock.ts"
import QueuePanel from "./QueuePanel.svelte"
import InputWidget from "./widgets/InputWidget.svelte"
import PlusWidget from "./widgets/PlusWidget.svelte"
import SendWidget from "./widgets/SendWidget.svelte"
import VoiceWidget from "./widgets/VoiceWidget.svelte"

let props: ComposerProps = $props()

const composer = provideComposer(new Composer(() => props))

const pane = usePane()

const morph = $derived(!pane || panes.active.id === pane() ? "composer" : undefined)

const split = $derived(!!pane && panes.leaves.length > 1)

const sharing = $derived(split && panes.shared)

const docked = $derived(sharing && panes.active.id === pane?.())

let box = $state<HTMLElement>()

let typing = $state(false)

$effect(() => {
  if (props.running) {
    composer.stopped = false
  }
})
</script>

<!-- dock() moves the form into the shared slot; this wrapper keeps the component in place -->
<div class="contents">
<form
  data-draft={props.draft}
  style:view-transition-name={morph}
  class={[
    "mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-1 px-4 pb-1.5 sm:px-8 sm:pb-2",
    sharing && !docked && "hidden",
  ]}
  {@attach dock(() => (docked ? panes.inputSlot : null))}
  onsubmit={e => {
    e.preventDefault()
    composer.submit()
  }}
>
  <input
    bind:this={composer.picker}
    type="file"
    multiple
    hidden
    onchange={e => {
      composer.add(e.currentTarget.files ?? [])
      e.currentTarget.value = ""
    }}
  />
  <QueuePanel />
  {#if composer.stopped}
    <p class="flex items-center gap-1.5 px-3 text-xs text-base-content/60" role="status">
      <Icon icon="lucide:circle-pause" class="size-3.5 shrink-0" />
      {m.stopped()}
    </p>
  {/if}
  <div class="flex items-end gap-2">
    {#if props.side}
      <div class="size-9 shrink-0">
        {@render props.side()}
      </div>
    {/if}
    <div
      bind:this={box}
      class={[
        "relative flex min-w-0 flex-1 items-end p-1",
        "rounded-3xl border border-base-300 bg-raised",
        "transition-colors duration-140 focus-within:border-primary",
      ]}
      onfocusin={e => {
        typing = e.target instanceof HTMLTextAreaElement
      }}
      onfocusout={e => {
        typing = e.relatedTarget instanceof HTMLTextAreaElement && !!box?.contains(e.relatedTarget)
      }}
    >
      <div class="flex h-7 shrink-0 items-center">
        <PlusWidget />
      </div>
      <InputWidget />
      <div class="size-7 shrink-0">
        <SendWidget />
      </div>
      {#if composer.talking && !typing && !composer.text}
        <CallBar
          running={props.busy}
          onopen={() => box?.querySelector("textarea")?.focus()}
        />
      {/if}
    </div>
  </div>
  <div class="flex min-w-0 items-center gap-1">
    {#if props.side}
      <div class="w-10 shrink-0"></div>
    {/if}
    <div class="flex min-w-0 flex-1 items-center gap-1">
      {@render props.tools?.()}
    </div>
    <VoiceWidget />
    {#if split}
      <IconButton
        icon={panes.shared ? "lucide:square-split-horizontal" : "lucide:text-cursor-input"}
        label={m.pane_input_shared()}
        size="xs"
        aria-pressed={panes.shared}
        class={["shrink-0", panes.shared && "text-primary"]}
        onclick={panes.toggleShared}
      />
    {/if}
  </div>
</form>
</div>
