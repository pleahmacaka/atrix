<script lang="ts">
import Icon from "@iconify/svelte"
import type { EventTag } from "#lib/calendar/store.ts"
import { COLOR_KEYS, COLORS, tagLabel, toColor } from "#lib/calendar/tags.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

let {
  tags,
  selected = $bindable(),
  oncreate,
  onupdate,
  onremove,
}: {
  tags: EventTag[]
  selected: string[]
  oncreate: (name: string) => Promise<string | null>
  onupdate: (tag: EventTag) => unknown
  onremove: (tag: EventTag) => unknown
} = $props()

let query = $state("")

let renaming = $state<string | null>(null)

const rename = (tag: EventTag, name: string) => {
  if (renaming !== tag.id) {
    return
  }

  renaming = null

  if (name && name !== tagLabel(tag)) {
    void onupdate({ ...tag, name })
  }
}

const menu = (e: MouseEvent, tag: EventTag) =>
  contextMenu.show(e, [
    {
      label: m.menu_rename(),
      icon: "lucide:pencil",
      run: () => (renaming = tag.id),
    },
    {
      label: m.panel_tag_hide(),
      icon: tag.hideWhileSharing ? "lucide:check" : "lucide:eye-off",
      run: () => onupdate({ ...tag, hideWhileSharing: !tag.hideWhileSharing }),
    },
    "separator",
    ...COLOR_KEYS.map(color => ({
      label: COLORS[color].label(),
      icon: toColor(tag.color) === color ? "lucide:check" : "lucide:circle",
      run: () => onupdate({ ...tag, color }),
    })),
    "separator",
    {
      label: m.common_delete(),
      icon: "lucide:trash-2",
      danger: true,
      confirm: m.menu_confirm_delete(),
      run: () => {
        selected = selected.filter(t => t !== tag.id)

        return onremove(tag)
      },
    },
  ])

const needle = $derived(query.trim())

const match = $derived(tags.find(t => tagLabel(t) === needle))

const shown = $derived(
  needle
    ? tags.filter(t => tagLabel(t).toLowerCase().includes(needle.toLowerCase()))
    : tags,
)

const toggle = (id: string) => {
  selected = selected.includes(id)
    ? selected.filter(t => t !== id)
    : [...selected, id]
}

const submit = async () => {
  if (match) {
    toggle(match.id)
  } else if (needle) {
    const id = await oncreate(needle)

    if (id) {
      selected = [...selected, id]
    }
  }

  query = ""
}
</script>

<div class="flex flex-col gap-1.5">
  <input
    class="input input-sm w-full"
    aria-label={m.calendar_tag_search()}
    placeholder={m.calendar_tag_search()}
    bind:value={query}
    onkeydown={e => {
      if (e.key === "Enter") {
        e.preventDefault()
        void submit()
      }
    }}
  />
  <div class="flex flex-wrap gap-1">
    {#each shown as tag (tag.id)}
      {@const on = selected.includes(tag.id)}
      {#if renaming === tag.id}
        <input
          class="input input-xs w-28"
          aria-label={m.calendar_tag_name()}
          value={tagLabel(tag)}
          {@attach el => el.select()}
          onblur={e => rename(tag, e.currentTarget.value.trim())}
          onkeydown={e => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              renaming = null
            }
          }}
        />
      {:else}
      <button
        type="button"
        class={[
          "btn btn-xs gap-1.5 border-0",
          on ? "bg-primary/8 text-primary" : "btn-ghost bg-base-content/5",
        ]}
        aria-pressed={on}
        onclick={() => toggle(tag.id)}
        oncontextmenu={e => menu(e, tag)}
      >
        <span class={["size-2 rounded-full", COLORS[toColor(tag.color)].chip]}></span>
        {tagLabel(tag)}
        {#if tag.hideWhileSharing}
          <Icon icon="lucide:eye-off" class="size-3 text-base-content/50" />
        {/if}
        {#if on}
          <Icon icon="lucide:check" class="size-3" />
        {/if}
      </button>
      {/if}
    {/each}
    {#if needle && !match}
      <button
        type="button"
        class="btn btn-ghost btn-xs gap-1 bg-base-content/5"
        onclick={submit}
      >
        <Icon icon="lucide:plus" class="size-3" />
        {m.calendar_tag_create({ name: needle })}
      </button>
    {/if}
  </div>
</div>
