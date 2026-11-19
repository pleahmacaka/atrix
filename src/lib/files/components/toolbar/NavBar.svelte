<script lang="ts">
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Explorer } from "../../store/explorer.svelte"
import { prefs } from "../../store/prefs.svelte"
import { terminal } from "../../store/terminal.svelte"
import AddressBar from "./AddressBar.svelte"
import CommandBar from "./CommandBar.svelte"
import CommandButton from "./CommandButton.svelte"

const SEARCH_DELAY = 280

let { explorer }: { explorer: Explorer } = $props()

let field = $state<HTMLInputElement>()

let address = $state<ReturnType<typeof AddressBar>>()

let timer = 0

const tab = $derived(explorer.tab)

const schedule = (value: string) => {
  clearTimeout(timer)
  tab.query = value
  timer = window.setTimeout(() => tab.search(value), SEARCH_DELAY)
}

const runNow = () => {
  clearTimeout(timer)
  tab.search(tab.query)
}

const clear = () => {
  clearTimeout(timer)
  tab.clearSearch()
}

export const focusSearch = () => {
  field?.focus()
  field?.select()
}

export const editAddress = () => address?.edit()
</script>

<div class="flex shrink-0 items-center gap-1 p-2">
  <CommandButton id="back" {explorer} />
  <CommandButton id="forward" {explorer} />
  <CommandButton id="up" {explorer} />
  <CommandButton id="refresh" {explorer} spin={tab.loading} />

  <AddressBar bind:this={address} {explorer} />

  <SearchField
    label={m.files_nav_search_aria()}
    placeholder={m.files_nav_search({ name: explorer.title(tab) })}
    class="w-64 shrink-0 select-text"
    bind:value={() => tab.query, schedule}
    onkeydown={e => {
      if (e.key === "Enter") {
        runNow()
      } else if (e.key === "Escape") {
        clear()
        e.currentTarget.blur()
      }
    }}
    {@attach node => {
      field = node instanceof HTMLInputElement ? node : undefined
    }}
  />

  <CommandButton id="terminal" {explorer} pressed={terminal.open} />

  {#if prefs.compactToolbar}
    <CommandBar {explorer} compact />
  {/if}
</div>
