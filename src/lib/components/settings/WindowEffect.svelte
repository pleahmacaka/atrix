<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import { m } from "#lib/paraglide/messages.js"
import { settings, type WindowEffect } from "#lib/store/settings.svelte.ts"

const EFFECTS: { id: WindowEffect; label: string }[] = [
  { id: "none", label: m.appearance_effect_none() },
  { id: "glass", label: m.appearance_effect_glass() },
]
</script>

<div class="flex flex-col items-end gap-3 max-sm:w-full max-sm:items-stretch">
  <Segmented
    label={m.appearance_window()}
    items={EFFECTS}
    value={settings.effect}
    onpick={settings.setEffect}
  />
  <label
    class={[
      "flex items-center gap-3 text-sm transition-opacity",
      settings.effect === "none" && "opacity-40",
    ]}
  >
    {m.appearance_transparency()}
    <input
      type="range"
      class="range range-primary range-xs w-32 max-sm:w-auto max-sm:flex-1"
      min="0"
      max="85"
      step="5"
      disabled={settings.effect === "none"}
      value={settings.transparency}
      oninput={e => settings.setTransparency(Number(e.currentTarget.value))}
    />
    <span class="w-10 text-end tabular-nums">{settings.transparency}%</span>
  </label>
</div>