<script lang="ts">
import Icon from "@iconify/svelte"
import {
  Composer,
  type ComposerProps,
  paneComposers,
  provideComposer,
} from "#lib/chat/composer.svelte.ts"
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

$effect.pre(() => {
  composer.floating = sharing
})

$effect(() => {
  const id = pane?.()

  if (!id) {
    return
  }

  paneComposers.set(id, composer)

  return () => {
    if (paneComposers.get(id) === composer) {
      paneComposers.delete(id)
    }
  }
})

let box = $state<HTMLElement>()

let typing = $state(false)

$effect(() => {
  if (props.running) {
    composer.stopped = false
  }
})
</script>
<div class="contents">
  {#if sharing}
    <div class="chat-width mx-auto w-full min-w-0 px-4 pb-1.5 empty:hidden sm:px-8">
      <QueuePanel />
    </div>
  {/if}
  <form
    data-draft={props.draft}
    style:view-transition-name={morph}
    class={[
      "group/composer chat-width mx-auto flex w-full min-w-0 flex-col gap-1 px-4 pb-1.5 sm:px-8 sm:pb-2",
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
    {#if !sharing}
      <QueuePanel />
    {/if}
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
    <div class="grid grid-rows-[1fr] transition-[grid-template-rows] duration-160 transition-discrete max-sm:grid-rows-[0fr] max-sm:opacity-0 max-sm:invisible max-sm:group-focus-within/composer:grid-rows-[1fr] max-sm:group-focus-within/composer:opacity-100 max-sm:group-focus-within/composer:visible">
      <div class="flex min-h-0 min-w-0 items-center gap-1 overflow-hidden">
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
    </div>
  </form>
</div>