<script lang="ts">
import Icon from "@iconify/svelte"
import { parseLocal } from "#lib/calendar/dates.ts"
import { shortDay } from "#lib/calendar/format.ts"
import type { SharedEvent, SharedRecord } from "#lib/calendar/shared.svelte.ts"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Panel } from "./panel.svelte.ts"

type Picking = "parent" | "group" | null

type Action = { id: "parent" | "child" | "group"; icon: string; label: string }

const LIMIT = 30

let {
  panel,
  event,
  parent,
  locked,
  onparent,
}: {
  panel: Panel
  event: SharedEvent | null
  parent: string | null
  locked: boolean
  onparent: (id: string | null) => void
} = $props()

let menu = $state(false)

let picking = $state<Picking>(null)

let query = $state("")

const parentEvent = $derived(
  parent ? panel.shown.find(e => e.id === parent) : undefined,
)

const children = $derived(
  event && !event.parentId ? panel.childrenOf(event) : [],
)

const members = $derived(
  event ? panel.groupOf(event).filter(e => e.id !== event.id) : [],
)

const distance = (e: SharedRecord) =>
  event
    ? Math.abs(
        parseLocal(e.start).getTime() - parseLocal(event.start).getTime(),
      )
    : 0

const candidates = $derived.by(() => {
  const needle = query.trim().toLowerCase()

  return panel.shown
    .filter(
      e =>
        e.id !== event?.id &&
        (picking === "parent"
          ? panel.isRoot(e)
          : !members.some(member => member.id === e.id)) &&
        e.title.toLowerCase().includes(needle),
    )
    .toSorted((a, b) => distance(a) - distance(b))
    .slice(0, LIMIT)
})

const actions = $derived<Action[]>([
  ...(!parent && !locked
    ? [
        {
          id: "parent" as const,
          icon: "lucide:corner-left-up",
          label: m.panel_relation_set_parent(),
        },
      ]
    : []),
  ...(event && !event.parentId
    ? [
        {
          id: "child" as const,
          icon: "lucide:corner-down-right",
          label: m.panel_relation_add_child(),
        },
      ]
    : []),
  ...(event
    ? [
        {
          id: "group" as const,
          icon: "lucide:group",
          label: m.panel_relation_group_with(),
        },
      ]
    : []),
])

const close = (e: MouseEvent) => {
  if (!(e.target instanceof Element && e.target.closest("[data-relation]"))) {
    menu = false
    picking = null
  }
}

const pick = (target: SharedRecord) => {
  if (picking === "parent") {
    onparent(target.id)
  } else if (event) {
    void panel.groupWith(event, target)
  }

  picking = null
  query = ""
}

const act = (id: Action["id"]) => {
  menu = false

  if (id === "child") {
    if (event) {
      panel.startChild(event)
    }
  } else {
    picking = id
  }
}
</script>

<svelte:window onmousedown={close} />

{#snippet row(icon: string, kind: string, target: SharedRecord, remove?: () => void)}
  <li
    class={[
      "group/relation flex min-w-0 items-center gap-2 rounded-field px-1 py-0.5",
      "transition-colors duration-120 hover:bg-base-content/8",
    ]}
  >
    <Icon {icon} class="size-3.5 shrink-0 text-base-content/45" />
    <span class="w-10 shrink-0 truncate text-xs text-base-content/55">{kind}</span>
    <button
      type="button"
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start"
      onclick={() => panel.show(target)}
    >
      <span class={["size-1.5 shrink-0 rounded-full", panel.dotTone(target)]}></span>
      <span class="truncate text-sm">{target.title}</span>
      <span class="shrink-0 text-xs text-base-content/45 tabular-nums">
        {shortDay(parseLocal(target.start))}
      </span>
    </button>
    {#if remove}
      <button
        type="button"
        class={[
          "btn btn-ghost btn-circle btn-xs opacity-0",
          "group-hover/relation:opacity-100 focus-visible:opacity-100",
        ]}
        aria-label={m.panel_relation_remove()}
        title={m.panel_relation_remove()}
        onclick={remove}
      >
        <Icon icon="lucide:x" class="size-3" />
      </button>
    {/if}
  </li>
{/snippet}

<div class="mt-6 flex flex-col gap-1" data-relation>
  <div class="relative flex items-center justify-between">
    <span class="text-xs font-medium text-base-content/60">
      {m.panel_relation()}
    </span>
    {#if actions.length > 0}
      <button
        type="button"
        class="btn btn-ghost btn-square btn-xs"
        aria-label={m.panel_relation_add()}
        title={m.panel_relation_add()}
        aria-expanded={menu}
        onclick={() => {
          menu = !menu
          picking = null
        }}
      >
        <Icon icon="lucide:plus" class="size-3.5" />
      </button>
    {/if}

    {#if menu}
      <div class="popover-box absolute end-0 top-full z-30 mt-1 flex w-44 flex-col p-1 text-sm">
        {#each actions as action (action.id)}
          <button
            type="button"
            class={[
              "flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-start",
              "transition-colors duration-120 hover:bg-base-content/8",
            ]}
            onclick={() => act(action.id)}
          >
            <Icon icon={action.icon} class="size-3.5 text-base-content/60" />
            {action.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if picking}
      <div
        class="popover-box absolute inset-x-0 top-full z-30 mt-1 flex flex-col gap-1 p-1.5 text-sm"
        onkeydowncapture={e => {
          if (e.key === "Escape") {
            e.stopPropagation()
            picking = null
          }
        }}
        role="presentation"
      >
        <SearchField
          bind:value={query}
          label={m.panel_relation_search()}
          {@attach node => {
            if (node instanceof HTMLElement) {
              node.focus()
            }
          }}
        />
        <ul class="flex max-h-48 flex-col overflow-y-auto">
          {#each candidates as candidate (candidate.id)}
            <li>
              <button
                type="button"
                class={[
                  "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 py-1",
                  "text-start transition-colors duration-120 hover:bg-base-content/8",
                ]}
                onclick={() => pick(candidate)}
              >
                <span class={["size-1.5 shrink-0 rounded-full", panel.dotTone(candidate)]}></span>
                <span class="truncate">{candidate.title}</span>
                <span class="ms-auto shrink-0 text-xs text-base-content/45 tabular-nums">
                  {shortDay(parseLocal(candidate.start))}
                </span>
              </button>
            </li>
          {:else}
            <li class="px-2 py-1 text-xs text-base-content/45">{m.calendar_empty()}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  {#if parentEvent || children.length > 0 || members.length > 0}
    <ul class="-mx-1 flex flex-col">
      {#if parentEvent}
        {@render row("lucide:corner-left-up", m.panel_relation_parent(), parentEvent, () =>
          onparent(null),
        )}
      {/if}
      {#each children as child (child.id)}
        {@render row("lucide:corner-down-right", m.panel_relation_child(), child)}
      {/each}
      {#each members as member (member.id)}
        {@render row("lucide:group", m.panel_group(), member, () => panel.ungroup(member))}
      {/each}
    </ul>
  {/if}
</div>
