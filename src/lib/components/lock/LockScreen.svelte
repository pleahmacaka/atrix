<script lang="ts">
import Icon from "@iconify/svelte"
import { cubicOut } from "svelte/easing"
import { checkLock, lockKind, screen } from "#lib/lock/lock.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import PatternPad from "./PatternPad.svelte"
import PinPad from "./PinPad.svelte"

let wrong = $state(false)

let dialog = $state<HTMLDialogElement>()

const kind = $derived(lockKind())

const shown = $derived(screen.locked && !!kind)

const veil = (_: Element) => ({
  duration: 320,
  easing: cubicOut,
  css: (t: number) =>
    `opacity: ${t}; transform: scale(${0.98 + t * 0.02});`,
})

const attempt = async (value: string) => {
  if (screen.waiting) {
    return
  }

  if (await checkLock(value)) {
    wrong = false
    screen.unlock()
  } else {
    screen.fail()
    wrong = true
  }
}

$effect(() => {
  if (!dialog) {
    return
  }

  if (shown && !dialog.open) {
    for (const other of document.querySelectorAll("dialog[open]")) {
      if (other !== dialog && other instanceof HTMLDialogElement) {
        other.close()
      }
    }

    dialog.showModal()
  } else if (!shown && dialog.open) {
    dialog.close()
  }
})
</script>

<dialog
  bind:this={dialog}
  class="lock-veil fixed inset-0 m-0 size-full max-h-none max-w-none bg-transparent p-0"
  aria-label={m.lock_title()}
  oncancel={e => e.preventDefault()}
>
  {#if shown}
    <div
      class="grid size-full place-items-center"
      transition:veil
    >
      <div class="flex flex-col items-center gap-6">
        <Icon icon="lucide:lock" class="size-8 text-base-content/70" />
        <p
          class={[
            "text-sm",
            wrong || screen.waiting ? "text-error" : "text-base-content/70",
          ]}
        >
          {screen.waiting
            ? m.lock_wait()
            : wrong
              ? m.lock_wrong()
              : kind === "pin"
                ? m.lock_pin_hint()
                : m.lock_pattern_hint()}
        </p>
        {#if kind === "pin"}
          <PinPad oncomplete={attempt} />
        {:else}
          <PatternPad oncomplete={attempt} />
        {/if}
      </div>
    </div>
  {/if}
</dialog>
