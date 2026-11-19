<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

const LENGTH = 4

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"]

let { oncomplete }: { oncomplete: (code: string) => void } = $props()

let code = $state("")

const press = (key: string) => {
  if (key === "back") {
    code = code.slice(0, -1)

    return
  }

  if (code.length >= LENGTH) {
    return
  }

  code += key

  if (code.length === LENGTH) {
    const done = code

    code = ""
    oncomplete(done)
  }
}
</script>

<svelte:window
  onkeydown={e => {
    if (/^[0-9]$/.test(e.key)) {
      press(e.key)
    } else if (e.key === "Backspace") {
      press("back")
    }
  }}
/>

<div class="flex flex-col items-center gap-6">
  <div class="flex gap-3" aria-hidden="true">
    {#each { length: LENGTH }, i}
      <span
        class={[
          "size-3 rounded-full border border-base-content/40 transition-colors duration-120",
          i < code.length && "border-primary bg-primary",
        ]}
      ></span>
    {/each}
  </div>
  <div class="grid grid-cols-3 gap-3">
    {#each KEYS as key, i (i)}
      {#if key === ""}
        <span></span>
      {:else if key === "back"}
        <button
          type="button"
          class="btn btn-circle btn-ghost size-16"
          aria-label={m.lock_delete_digit()}
          onclick={() => press(key)}
        >
          <Icon icon="lucide:delete" class="size-5" />
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-circle size-16 text-xl font-medium"
          onclick={() => press(key)}
        >
          {key}
        </button>
      {/if}
    {/each}
  </div>
</div>
