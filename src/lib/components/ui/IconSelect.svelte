<script lang="ts">
import Icon from "@iconify/svelte"
import Select, { type SelectOption } from "./Select.svelte"

export type Choice = { value: string; name: string; detail?: string }

export type ChoiceGroup = { label: string; choices: Choice[] }

let {
  icon,
  label,
  value,
  choices = [],
  groups = [],
  disabled = false,
  ghost = true,
  class: extra = "",
  onchange,
}: {
  icon: string
  label: string
  value: string
  choices?: Choice[]
  groups?: ChoiceGroup[]
  disabled?: boolean
  ghost?: boolean
  class?: string
  onchange: (value: string) => void
} = $props()

const options = $derived<SelectOption<string>[]>([
  ...choices.map(c => ({ value: c.value, label: c.name, detail: c.detail })),
  ...groups.flatMap(g =>
    g.choices.map(c => ({
      value: c.value,
      label: c.name,
      detail: c.detail,
      group: g.label,
    })),
  ),
])

const selected = $derived(options.find(o => o.value === value))
</script>

<Select
  {options}
  {value}
  {label}
  {disabled}
  onchange={onchange}
  class={["select-sm w-auto max-w-60 min-w-0", ghost && "select-ghost", extra]}
>
  {#snippet display()}
    <Icon {icon} class="size-4 shrink-0 opacity-60" />
    <span class="min-w-0 truncate">{selected?.label ?? label}</span>
  {/snippet}
</Select>
