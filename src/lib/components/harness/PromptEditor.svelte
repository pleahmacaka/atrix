<script lang="ts">
import Icon from "@iconify/svelte"
import { prompts } from "#lib/agents/agents.svelte.ts"
import {
  kindOf,
  nameTaken,
  PART_ICONS,
  PART_NAME,
  VARIABLE_NAME,
} from "#lib/agents/compose.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import { m } from "#lib/paraglide/messages.js"
import { local, type PartKind, type Requires } from "#lib/store/local.svelte.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import RequireTags from "./RequireTags.svelte"

const KINDS: PartKind[] = ["prompt", "instruction", "variable"]

const NAME_LABELS: Record<PartKind, () => string> = {
  prompt: m.prompt_name,
  instruction: m.instruction_name,
  variable: m.variable_name,
}

const HINTS: Record<PartKind, () => string> = {
  prompt: m.prompt_text_hint,
  instruction: m.instruction_hint,
  variable: m.variable_hint,
}

const attempt = new Attempt()

const rest = $derived(nav.agent?.startsWith("prompt:") ? nav.agent.slice("prompt:".length) : "new")

const existing = $derived(rest.startsWith("new") ? undefined : prompts.find(rest))

const kind = $derived.by((): PartKind => {
  if (existing) {
    return kindOf(existing)
  }

  return KINDS.find(k => rest === `new:${k}`) ?? "prompt"
})

let name = $state("")

let text = $state("")

let requires = $state<Requires>({})

$effect(() => {
  name = existing?.name ?? ""
  text = existing?.text ?? ""
  requires = existing?.requires ?? {}
})

const trimmed = $derived(name.trim())

const invalid = $derived(
  !!trimmed && !(kind === "variable" ? VARIABLE_NAME : PART_NAME).test(trimmed),
)

const taken = $derived(
  !!trimmed && nameTaken(local.data.prompts, kind, trimmed, existing?.id ?? null),
)

const usage = $derived(kind === "variable" ? `{{${trimmed}}}` : `{{#${trimmed}}}`)

const save = () =>
  attempt.run(async () => {
    const saved = await prompts.save({
      id: existing?.id ?? null,
      name: trimmed,
      kind,
      text,
      ...(kind !== "variable" && { requires }),
    })

    nav.agent = `prompt:${saved}`
  })

const remove = () =>
  attempt.run(async () => {
    if (existing) {
      await prompts.remove(existing.id)
    }

    nav.agent = null
  })
</script>

<section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
  <form
    class="mx-auto flex w-full max-w-2xl flex-col gap-2"
    onsubmit={e => {
      e.preventDefault()
      save()
    }}
  >
    <div class="flex flex-wrap items-center gap-2">
      <IconInput
        icon={PART_ICONS[kind]}
        label={NAME_LABELS[kind]()}
        placeholder={NAME_LABELS[kind]()}
        ghost={false}
        class="w-64 max-sm:w-full"
        bind:value={name}
      />
      {#if trimmed && !invalid}
        <span class="badge badge-soft badge-primary">{usage}</span>
      {/if}
    </div>
    {#if invalid}
      <p class="px-1 text-xs text-error">
        {kind === "variable" ? m.variable_name_invalid() : m.prompt_name_invalid()}
      </p>
    {:else if taken}
      <p class="px-1 text-xs text-error">{m.name_taken()}</p>
    {/if}
    <textarea
      class={["textarea w-full", kind === "variable" ? "min-h-24" : "min-h-80"]}
      aria-label={HINTS[kind]()}
      placeholder={HINTS[kind]()}
      bind:value={text}
    ></textarea>
    {#if kind !== "variable"}
      <span class="px-1 text-xs text-base-content/60">{m.dependencies()}</span>
      <RequireTags bind:value={requires} kinds={["skills", "tools", "mcp"]} />
    {/if}
    <div class="flex items-center justify-end gap-2">
      {#if existing}
        <ConfirmButton label={m.common_delete()} labeled onconfirm={remove} />
      {/if}
      <button
        type="submit"
        class="btn btn-primary btn-sm"
        disabled={attempt.busy || !trimmed || invalid || taken}
      >
        <Icon icon="lucide:check" class="size-4" />
        {m.common_save()}
      </button>
    </div>
    <ErrorAlert message={attempt.failure} />
  </form>
</section>
