<script module lang="ts">
export type SelectOption<T> = {
  value: T
  label: string
  group?: string
  detail?: string
  keywords?: string[]
  disabled?: string
  older?: boolean
  icon?: string
}
</script>

<script lang="ts" generics="T">
import Icon from "@iconify/svelte"
import { groupBy } from "es-toolkit"
import { type Snippet, tick } from "svelte"
import type { ClassValue } from "svelte/elements"
import { m } from "#lib/paraglide/messages.js"
import Listbox from "./Listbox.svelte"

let {
  options,
  value = $bindable(),
  onchange,
  label,
  placeholder = m.common_select(),
  disabled = false,
  class: className,
  leading,
  display,
  search: forceSearch = false,
  chip = false,
}: {
  options: SelectOption<T>[]
  value: T
  onchange?: (value: T) => void
  label: string
  placeholder?: string
  disabled?: boolean
  class?: ClassValue
  leading?: Snippet<[SelectOption<T>]>
  display?: Snippet
  search?: boolean
  chip?: boolean
} = $props()

const id = $props.id()

let trigger = $state<HTMLButtonElement>()

let list = $state<ReturnType<typeof Listbox<SelectOption<T>>>>()

let search = $state<HTMLInputElement>()

let open = $state(false)

let query = $state("")

const SEARCH_MIN = 8

const searchable = $derived(forceSearch || options.length > SEARCH_MIN)

let seed = ""

let active = $state(-1)

let expanded = $state(false)

const selected = $derived(options.find(o => o.value === value))

const older = $derived(options.filter(o => o.older).length)

const folded = $derived(
  older > 0 && !expanded && !selected?.older && query.trim() === "",
)

const groups = $derived.by(() => {
  const q = query.trim().toLowerCase()

  const found = options
    .filter(o => !(folded && o.older))
    .filter(o =>
      [o.label, o.detail ?? "", o.group ?? "", ...(o.keywords ?? [])].some(t =>
        t.toLowerCase().includes(q),
      ),
    )
    .map(o => (o.older ? { ...o, group: m.select_older() } : o))

  return Object.entries(groupBy(found, o => o.group ?? "")).map(
    ([name, items]) => ({ name, items }),
  )
})

const pop = () => document.getElementById(`${id}-pop`)

const choose = (option: SelectOption<T>) => {
  pop()?.hidePopover()

  if (option.value !== value) {
    value = option.value
    onchange?.(option.value)
  }
}

const toggled = async (e: ToggleEvent) => {
  if (e.newState === "closed") {
    open = false
    expanded = false

    if (pop()?.contains(document.activeElement)) {
      trigger?.focus({ preventScroll: true })
    }

    return
  }

  open = true
  query = seed
  seed = ""

  await tick()

  if (searchable) {
    search?.focus({ preventScroll: true })
  } else {
    pop()?.querySelector<HTMLElement>("[role=option]")?.focus({ preventScroll: true })
  }

  const current = groups
    .flatMap(g => g.items)
    .findIndex(o => o.value === value)

  list?.move(Math.max(current, 0), 1)
}

const openWith = (e: KeyboardEvent) => {
  const typed =
    e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey

  if (typed || e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault()
    seed = typed ? e.key : ""
    pop()?.showPopover()
  }
}

const navigate = (e: KeyboardEvent) => {
  if (e.key === "Tab") {
    pop()?.hidePopover()

    return
  }

  if (e.key === "Escape" && !e.isComposing) {
    e.preventDefault()
    e.stopPropagation()
    pop()?.hidePopover()

    return
  }

  list?.navigate(e)
}

const filter = (e: Event & { currentTarget: HTMLInputElement }) => {
  e.stopPropagation()
  query = e.currentTarget.value
  list?.move(0, 1)
}

const leave = (e: FocusEvent) => {
  const next = e.relatedTarget

  if (next instanceof Node && next !== trigger && !pop()?.contains(next)) {
    pop()?.hidePopover()
  }
}
</script>

<button
  bind:this={trigger}
  type="button"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={`${label}: ${selected?.label ?? placeholder}`}
  popovertarget={`${id}-pop`}
  title={selected?.label ?? placeholder}
  style:anchor-name={`--${id}`}
  {disabled}
  class={[
    chip
      ? "btn btn-ghost btn-xs max-w-72 min-w-0 justify-start font-normal"
      : "select cursor-pointer items-center gap-2 bg-none ps-3 pe-2 text-left",
    "disabled:cursor-not-allowed",
    className,
  ]}
  onkeydown={openWith}
>
  <span class="flex min-w-0 flex-1 items-center gap-2">
    {#if display}
      {@render display()}
    {:else}
      {#if selected && leading}
        {@render leading(selected)}
      {/if}
      <span class={["min-w-0 flex-1 truncate", !selected && "text-base-content/50"]}>
        {selected?.label ?? placeholder}
      </span>
    {/if}
  </span>
  {#if !chip}
    <Icon
      icon="lucide:chevron-down"
      class={[
        "size-4 shrink-0 opacity-60 transition-transform duration-140",
        open && "rotate-180",
      ]}
    />
  {/if}
</button>

<Listbox
  bind:this={list}
  bind:active
  {id}
  {label}
  anchor={`--${id}`}
  {groups}
  sheet
  selected={o => o.value === value}
  disabled={o => !!o.disabled}
  title={o => o.disabled ?? [o.label, o.detail].filter(Boolean).join("\n")}
  onpick={choose}
  onbeforetoggle={toggled}
  onfocusout={leave}
>
  {#snippet header()}
    {#if searchable}
    <label
      class="flex shrink-0 items-center gap-2 border-b border-base-content/10 px-3"
    >
      <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
      <input
        bind:this={search}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={active < 0 ? undefined : `${id}-${active}`}
        aria-label={m.select_search({ label })}
        placeholder={m.common_search()}
        autocomplete="off"
        spellcheck="false"
        class={[
          "h-10 min-w-0 flex-1 bg-transparent text-sm outline-none",
          "max-sm:h-12 max-sm:text-base",
        ]}
        value={query}
        oninput={filter}
        onchange={e => e.stopPropagation()}
        onkeydown={navigate}
      />
    </label>
    {/if}
  {/snippet}

  {#snippet footer()}
    {#if folded}
      <button
        type="button"
        class={[
          "mx-1 mb-1 flex min-h-8 cursor-pointer items-center gap-2 rounded-field px-2",
          "text-sm text-base-content/60 hover:bg-base-content/10",
        ]}
        onpointerdown={e => e.preventDefault()}
        onclick={() => (expanded = true)}
      >
        <Icon icon="lucide:history" class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">
          {m.select_older_count({ count: older })}
        </span>
        <Icon icon="lucide:chevron-right" class="size-4 shrink-0" />
      </button>
    {/if}
  {/snippet}

  {#snippet option(o)}
    {#if leading}
      {@render leading(o)}
    {/if}
    {#if o.icon}
      <Icon icon={o.icon} class="size-4 shrink-0 opacity-80" />
    {/if}
    <span class="min-w-0 flex-1 truncate">{o.label}</span>
    {#if o.disabled}
      <Icon icon="lucide:lock" class="size-4 shrink-0 opacity-60" />
    {/if}
    {#if o.detail}
      <span
        class="min-w-0 max-w-1/2 truncate text-right text-xs text-base-content/50 tabular-nums"
      >
        {o.detail}
      </span>
    {/if}
    <Icon
      icon="lucide:check"
      class={["size-4 shrink-0", o.value !== value && "invisible"]}
    />
  {/snippet}
</Listbox>
