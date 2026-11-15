<script lang="ts">
import type { Block } from "#lib/chat/blocks.ts"
import Select from "#lib/components/ui/Select.svelte"
import { m } from "#lib/paraglide/messages.js"

type Form = Extract<Block, { type: "form" }>

type Field = Form["fields"][number]

let {
  block,
  onAction,
}: { block: Form; onAction?: (text: string) => void } = $props()

const uid = $props.id()

const values = $state<Record<string, string | boolean>>({})

const missing = $derived(
  block.fields.some(
    f => f.required && f.kind !== "check" && !String(values[f.name] ?? "").trim(),
  ),
)

const labelOf = (field: Field) =>
  field.required ? m.ui_field_required({ label: field.label }) : field.label

const answer = (field: Field) => {
  const value = values[field.name]

  if (field.kind === "check") {
    return value ? m.ui_checked() : m.ui_unchecked()
  }

  return String(value ?? "").trim()
}

const submit = () => {
  if (missing || !onAction) {
    return
  }

  onAction(
    [
      block.title ?? block.submit,
      ...block.fields.map(f => `${f.label}: ${answer(f)}`),
    ].join("\n"),
  )
}
</script>

<form
  class="flex flex-col gap-3"
  onsubmit={e => {
    e.preventDefault()
    submit()
  }}
>
  {#each block.fields as field, i (i)}
    {#if field.kind === "check"}
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          checked={values[field.name] === true}
          onchange={e => (values[field.name] = e.currentTarget.checked)}
        />
        {field.label}
      </label>
    {:else if field.kind === "select"}
      <div class="flex flex-col gap-1 text-sm">
        <span class="text-base-content/70">{labelOf(field)}</span>
        <Select
          label={field.label}
          class="select-sm w-full"
          options={(field.options ?? []).map(o => ({ value: o, label: o }))}
          value={String(values[field.name] ?? "")}
          onchange={v => (values[field.name] = v)}
        />
      </div>
    {:else}
      <label class="flex flex-col gap-1 text-sm" for="{uid}-{i}">
        <span class="text-base-content/70">{labelOf(field)}</span>
        <input
          id="{uid}-{i}"
          class="input input-sm w-full"
          type={field.kind === "number" ? "number" : "text"}
          value={values[field.name] ?? ""}
          oninput={e => (values[field.name] = e.currentTarget.value)}
        />
      </label>
    {/if}
  {/each}
  <button
    type="submit"
    class="btn btn-primary btn-sm self-end"
    disabled={missing || !onAction}
    title={missing ? m.ui_submit_required() : block.submit}
  >
    {block.submit}
  </button>
</form>
