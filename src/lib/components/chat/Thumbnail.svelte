<script lang="ts">
import ImageViewer, { type Viewed } from "#lib/components/ui/ImageViewer.svelte"
import { m } from "#lib/paraglide/messages.js"

let { url, name }: { url: string; name: string } = $props()

let zoomed = $state<Viewed | null>(null)
</script>

<button
  type="button"
  class="island block h-24 w-36 max-w-full shrink-0 cursor-zoom-in overflow-hidden"
  aria-label={m.attach_zoom({ name })}
  title={name}
  onclick={() => {
    zoomed = { url, name }
  }}
>
  <img src={url} alt={name} class="size-full object-cover" loading="lazy" />
</button>

<ImageViewer bind:image={zoomed} />
