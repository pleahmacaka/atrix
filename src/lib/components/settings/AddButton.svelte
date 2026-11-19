<script lang="ts">
import Icon from "@iconify/svelte"

let { label, onclick }: { label: string; onclick: () => void } = $props()
</script>

<button
  type="button"
  class="btn btn-ghost -mx-2 justify-start gap-3 px-2 font-medium text-base-content/70"
  {onclick}
>
  <Icon icon="lucide:plus" class="size-5 shrink-0" />
  {label}
</button>