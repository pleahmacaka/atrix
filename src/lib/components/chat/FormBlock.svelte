<script lang="ts">
import type { Block } from "#lib/chat/blocks.ts"
import { m } from "#lib/paraglide/messages.js"

type Form = Extract<Block, { type: "form" }>

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

const answer = (field: Form["fields"][number]) => {
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
    {:else}
      <label class="flex flex-col gap-1 text-sm" for="{uid}-{i}">
        <span class="text-base-content/70">
          {field.label}{field.required ? " *" : ""}
        </span>
        {#if field.kind === "select"}
          <select
            id="{uid}-{i}"
            class="select select-sm w-full"
            value={values[field.name] ?? ""}
            onchange={e => (values[field.name] = e.currentTarget.value)}
          >
            <option value="" disabled></option>
            {#each field.options ?? [] as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input
            id="{uid}-{i}"
            class="input input-sm w-full"
            type={field.kind === "number" ? "number" : "text"}
            value={values[field.name] ?? ""}
            oninput={e => (values[field.name] = e.currentTarget.value)}
          />
        {/if}
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
