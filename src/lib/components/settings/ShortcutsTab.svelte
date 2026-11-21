<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import {
  assignable,
  bindingOf,
  chordOf,
  conflictOf,
  defaultOf,
  keysFor,
  rebind,
  SHORTCUTS,
  type ShortcutId,
} from "#lib/store/shortcuts.ts"

let recording = $state<ShortcutId | null>(null)

let conflict = $state<{ id: ShortcutId; name: string } | null>(null)

const overridden = (id: ShortcutId) => bindingOf(id) !== defaultOf(id)

const anyOverridden = $derived(SHORTCUTS.some(s => "binding" in s && overridden(s.id)))

const stop = () => {
  recording = null
}

const start = (id: ShortcutId) => {
  conflict = null
  recording = id
}

const resetAll = () => {
  for (const s of SHORTCUTS) {
    if ("binding" in s) {
      rebind(s.id, null)
    }
  }

  conflict = null
}

$effect(() => {
  const id = recording

  if (!id) {
    return
  }

  const record = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopImmediatePropagation()

    if (e.key === "Escape") {
      stop()

      return
    }

    const chord = chordOf(e)

    if (!chord || !assignable(chord)) {
      return
    }

    const taken = conflictOf(id, chord)

    if (taken) {
      conflict = { id, name: taken.label }
    } else {
      rebind(id, chord)
      conflict = null
    }

    stop()
  }

  window.addEventListener("keydown", record, { capture: true })

  return () => {
    window.removeEventListener("keydown", record, { capture: true })
  }
})
</script>

{#snippet keys(list: string[])}
  {#each list as key, i (`${i}:${key}`)}
    <kbd class="kbd kbd-sm font-sans tabular-nums">{key}</kbd>
  {/each}
{/snippet}

<Section icon="lucide:keyboard" title={m.settings_shortcuts()}>
  {#snippet actions()}
    <button type="button" class="btn btn-ghost btn-sm" disabled={!anyOverridden} onclick={resetAll}>
      <Icon icon="lucide:rotate-ccw" class="size-4" />
      {m.shortcut_reset_all()}
    </button>
  {/snippet}
  {#each SHORTCUTS as shortcut (shortcut.id)}
    {@const active = recording === shortcut.id}
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
          onclick={() => (active ? stop() : start(shortcut.id))}
        >
          <Icon icon="lucide:keyboard" class="size-4 shrink-0 opacity-50" />
          <span class="flex min-w-0 items-center justify-end gap-1">
            {#if active}
              <span class="truncate text-sm">{m.shortcut_recording()}</span>
            {:else}
              {@render keys(keysFor(shortcut))}
            {/if}
          </span>
        </button>
      {:else}
        <span class="flex w-44 justify-end gap-1 px-3 whitespace-nowrap">
          {@render keys(keysFor(shortcut))}
        </span>
      {/if}
    </SettingRow>
    {#if conflict?.id === shortcut.id}
      <p class="-mt-2 pb-2 text-end text-xs text-error" role="alert">
        {m.shortcut_conflict({ name: conflict.name })}
      </p>
    {/if}
  {/each}
</Section>
