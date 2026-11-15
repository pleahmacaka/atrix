<script lang="ts">
import { Composer, type ComposerProps, provideComposer } from "#lib/chat/composer.svelte.ts"
import AttachWidget from "./widgets/AttachWidget.svelte"
import InputWidget from "./widgets/InputWidget.svelte"
import PlusWidget from "./widgets/PlusWidget.svelte"
import SendWidget from "./widgets/SendWidget.svelte"
import VoiceWidget from "./widgets/VoiceWidget.svelte"

let props: ComposerProps = $props()

const composer = provideComposer(new Composer(() => props))
</script>

<form
  class="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2 px-2 pb-2 sm:px-4 sm:pb-3"
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
  <div class="flex items-end gap-2">
    {#if props.side}
      <div class="size-12 shrink-0">
        {@render props.side()}
      </div>
    {:else}
      <div class="flex h-12 shrink-0 items-center">
        <PlusWidget />
      </div>
    {/if}
    <div
      class={[
        "relative flex min-h-12 min-w-0 flex-1 rounded-box border border-base-300 bg-raised",
        "transition-colors duration-140 focus-within:border-primary",
      ]}
    >
      <InputWidget />
    </div>
    <div class="size-12 shrink-0">
      <SendWidget />
    </div>
  </div>
  <div class="flex min-w-0 items-center gap-1">
    {#if props.side}
      <div class="h-8 w-12 shrink-0">
        <AttachWidget />
      </div>
    {/if}
    <div class="flex min-w-0 flex-1 items-center gap-1">
      {@render props.tools?.()}
    </div>
    <VoiceWidget />
  </div>
</form>
