<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import { m } from "#lib/paraglide/messages.js"
import ModelGateways from "./ModelGateways.svelte"
import SpeechProviders from "./SpeechProviders.svelte"

type Category = "llm" | "stt" | "tts"

const CATEGORIES: { id: Category; icon: string; label: () => string }[] = [
  { id: "llm", icon: "lucide:sparkles", label: m.gateway_category_llm },
  { id: "stt", icon: "lucide:mic", label: m.gateway_category_stt },
  { id: "tts", icon: "lucide:volume-2", label: m.gateway_category_tts },
]

let category = $state<Category>("llm")
</script>

<div class="flex flex-col gap-4">
  <div class="self-start">
    <Segmented
      label={m.settings_gateway()}
      items={CATEGORIES.map(c => ({ id: c.id, label: c.label(), icon: c.icon }))}
      value={category}
      onpick={id => {
        category = id
      }}
    />
  </div>
  {#if category === "llm"}
    <ModelGateways />
  {:else}
    {#key category}
      <SpeechProviders role={category} />
    {/key}
  {/if}
</div>
