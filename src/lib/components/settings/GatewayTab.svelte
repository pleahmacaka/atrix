<script lang="ts">
import Icon from "@iconify/svelte"
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
  <div class="tabs tabs-box self-start" role="tablist">
    {#each CATEGORIES as item (item.id)}
      <button
        type="button"
        role="tab"
        class={["tab gap-2", category === item.id && "tab-active"]}
        aria-selected={category === item.id}
        onclick={() => {
          category = item.id
        }}
      >
        <Icon icon={item.icon} class="size-4" />
        {item.label()}
      </button>
    {/each}
  </div>
  {#if category === "llm"}
    <ModelGateways />
  {:else}
    {#key category}
      <SpeechProviders role={category} />
    {/key}
  {/if}
</div>
