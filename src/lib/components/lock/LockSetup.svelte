<script lang="ts">
import Modal from "#lib/components/ui/Modal.svelte"
import { checkLock, clearLock, lockKind, screen, setLock } from "#lib/lock/lock.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import PatternPad from "./PatternPad.svelte"
import PinPad from "./PinPad.svelte"

const MIN_DOTS = 4

let verified = $state(false)

let first = $state<string | null>(null)

let notice = $state<string | null>(null)

const goal = $derived(screen.setup)

const current = $derived(lockKind())

const checking = $derived(!!current && !verified)

const pad = $derived(checking ? current : goal === "remove" ? null : goal)

const title = $derived(
  goal === "remove"
    ? m.lock_remove()
    : goal === "pattern"
      ? m.lock_set_pattern()
      : m.lock_set_pin(),
)

const prompt = $derived(
  notice ??
    (checking
      ? m.lock_verify()
      : first
        ? m.lock_setup_confirm()
        : goal === "pin"
          ? m.lock_setup_pin()
          : m.lock_setup_pattern()),
)

const close = () => {
  screen.setup = null
  verified = false
  first = null
  notice = null
}

const verify = async (value: string) => {
  if (screen.waiting) {
    return
  }

  if (!(await checkLock(value))) {
    screen.fail()
    notice = screen.waiting ? m.lock_wait() : m.lock_wrong()

    return
  }

  notice = null

  if (goal === "remove") {
    await clearLock()
    close()

    return
  }

  verified = true
}

const enter = async (value: string) => {
  if (checking) {
    await verify(value)

    return
  }

  if (goal === "pattern" && value.split("-").length < MIN_DOTS) {
    notice = m.lock_pattern_short()

    return
  }

  if (!first) {
    first = value
    notice = null

    return
  }

  if (first !== value) {
    first = null
    notice = m.lock_setup_mismatch()

    return
  }

  if (goal === "pin" || goal === "pattern") {
    await setLock(goal, value)
  }

  close()
}
</script>

<Modal
  bind:open={() => goal !== null && !screen.locked, open => !open && close()}
  label={title}
  class="max-w-sm"
>
  <div class="flex flex-col items-center gap-5 p-6">
    <h2 class="text-base font-semibold">{title}</h2>
    <p class="text-center text-sm text-base-content/70">{prompt}</p>
    {#key `${checking}-${first}`}
      {#if pad === "pin"}
        <PinPad oncomplete={enter} />
      {:else if pad === "pattern"}
        <PatternPad oncomplete={enter} />
      {/if}
    {/key}
    <button type="button" class="btn btn-ghost btn-sm" onclick={close}>
      {m.common_cancel()}
    </button>
  </div>
</Modal>
