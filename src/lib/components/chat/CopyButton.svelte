<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

let { text }: { text: string } = $props()

let copied = $state(false)

const copy = async () => {
  await navigator.clipboard.writeText(text)
  copied = true
  setTimeout(() => {
    copied = false
  }, 1500)
}
</script>

<button
  type="button"
  class="btn btn-ghost btn-xs btn-square"
  aria-label={m.common_copy()}
  onclick={copy}
>
  <Icon icon={copied ? "lucide:check" : "lucide:copy"} class="size-4" />
</button>
