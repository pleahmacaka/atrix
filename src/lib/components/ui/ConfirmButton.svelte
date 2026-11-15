<script lang="ts">
import Icon from "@iconify/svelte"
import type { ClassValue } from "svelte/elements"
import { m } from "#lib/paraglide/messages.js"

const DISARM_MS = 3000

let {
  icon = "lucide:trash-2",
  label,
  confirm = m.common_confirm_delete(),
  disabled = false,
  labeled = false,
  class: extra = "btn-sm",
  onconfirm,
}: {
  icon?: string
  label: string
  confirm?: string
  disabled?: boolean
  labeled?: boolean
  class?: ClassValue
  onconfirm: () => unknown
} = $props()

let armed = $state(false)

let timer: ReturnType<typeof setTimeout> | undefined

const disarm = () => {
  clearTimeout(timer)
  armed = false
}

const click = async () => {
  if (!armed) {
    armed = true
    timer = setTimeout(disarm, DISARM_MS)

    return
  }

  disarm()
  await onconfirm()
}

$effect(() => disarm)
</script>

<button
  type="button"
  class={[
    "btn btn-ghost cursor-pointer",
    labeled ? "px-2.5" : "btn-square",
    armed && "bg-error/12 text-error",
    extra,
  ]}
  aria-label={armed ? confirm : label}
  title={armed ? confirm : label}
  {disabled}
  onclick={click}
  onblur={disarm}
  onkeydown={e => {
    if (e.key === "Escape" && armed) {
      e.stopPropagation()
      disarm()
    }
  }}
>
  {#if labeled}
    <Icon {icon} class="size-4" />
    <span class="grid justify-items-start">
      <span class={["col-start-1 row-start-1", armed && "invisible"]}>{label}</span>
      <span class={["col-start-1 row-start-1", !armed && "invisible"]}>
        {confirm}
      </span>
    </span>
  {:else}
    <Icon icon={armed ? "lucide:check" : icon} class="size-4" />
  {/if}
</button>
