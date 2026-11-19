<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { bindingOf, defaultOf, keysFor, rebind, SHORTCUTS, type ShortcutId } from "#lib/store/shortcuts.ts"
import ShortcutKeys from "./ShortcutKeys.svelte"
import { ShortcutRecorder } from "./shortcutRecorder.svelte.ts"

const recorder = new ShortcutRecorder()

const overridden = (id: ShortcutId) => bindingOf(id) !== defaultOf(id)

const anyOverridden = $derived(SHORTCUTS.some(s => "binding" in s && overridden(s.id)))

const resetAll = () => {
  for (const s of SHORTCUTS) {
    if ("binding" in s) {
      rebind(s.id, null)
    }
  }

  recorder.conflict = null
}

$effect(() => recorder.capture())
</script>

<Section icon="lucide:keyboard" title={m.settings_shortcuts()}>
  {#snippet actions()}
    <button type="button" class="btn btn-ghost btn-sm" disabled={!anyOverridden} onclick={resetAll}>
      <Icon icon="lucide:rotate-ccw" class="size-4" />
      {m.shortcut_reset_all()}
    </button>
  {/snippet}
  {#each SHORTCUTS as shortcut (shortcut.id)}
    {@const active = recorder.id === shortcut.id}
    <SettingRow title={shortcut.label}>
      {#if "binding" in shortcut}
        <IconButton
          icon="lucide:rotate-ccw"
          label={m.shortcut_reset()}
          size="xs"
          class={[!overridden(shortcut.id) && "invisible"]}
          onclick={() => rebind(shortcut.id, null)}
        />
        <button
          type="button"
          class={[
            "input input-sm w-44 cursor-pointer justify-between gap-2 whitespace-nowrap",
            "transition-colors duration-140 hover:bg-base-content/5",
            active && "animate-pulse border-primary text-primary",
          ]}
          aria-label={m.shortcut_change({ name: shortcut.label })}
          aria-pressed={active}
          onclick={() => (active ? recorder.stop() : recorder.start(shortcut.id))}
        >
          <Icon icon="lucide:keyboard" class="size-4 shrink-0 opacity-50" />
          <span class="flex min-w-0 items-center justify-end gap-1">
            {#if active}
              <span class="truncate text-sm">{m.shortcut_recording()}</span>
            {:else}
              <ShortcutKeys keys={keysFor(shortcut)} />
            {/if}
          </span>
        </button>
      {:else}
        <span class="flex w-44 justify-end gap-1 px-3 whitespace-nowrap">
          <ShortcutKeys keys={keysFor(shortcut)} />
        </span>
      {/if}
    </SettingRow>
    {#if recorder.conflict?.id === shortcut.id && recorder.conflict}
      <p class="-mt-2 pb-2 text-end text-xs text-error" role="alert">
        {m.shortcut_conflict({ name: recorder.conflict.name })}
      </p>
    {/if}
  {/each}
</Section>