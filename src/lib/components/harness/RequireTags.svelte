<script lang="ts">
import Icon from "@iconify/svelte"
import type { DepKind } from "#lib/agents/compose.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Requires } from "#lib/store/local.svelte.ts"

let {
  value = $bindable({}),
  kinds,
  suggest = {},
}: {
  value?: Requires
  kinds: DepKind[]
  suggest?: Partial<Record<DepKind, string[]>>
} = $props()

const LABELS: Record<DepKind, () => string> = {
  skills: m.dep_skills,
  tools: m.dep_tools,
  mcp: m.dep_mcp,
}

const ICONS: Record<DepKind, string> = {
  skills: "lucide:sparkles",
  tools: "lucide:wrench",
  mcp: "lucide:plug",
}

const uid = $props.id()

const add = (kind: DepKind, input: HTMLInputElement) => {
  const name = input.value.trim()
  const current = value[kind] ?? []

  input.value = ""

  if (name && !current.includes(name)) {
    value = { ...value, [kind]: [...current, name] }
  }
}

const drop = (kind: DepKind, name: string) => {
  value = { ...value, [kind]: (value[kind] ?? []).filter(n => n !== name) }
}
</script>

<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
  {#each kinds as kind (kind)}
    <div class="flex min-w-0 flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2">
      <span class="flex items-center gap-1.5 px-1 text-xs text-base-content/60">
        <Icon icon={ICONS[kind]} class="size-3.5" />
        {LABELS[kind]()}
      </span>
      <div class="flex flex-wrap gap-1">
        {#each value[kind] ?? [] as name (name)}
          <span class="badge badge-soft badge-primary gap-1">
            {name}
            <button
              type="button"
              class="cursor-pointer opacity-60 hover:opacity-100"
              aria-label={m.dep_remove({ name })}
              onclick={() => drop(kind, name)}
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
          </span>
        {/each}
      </div>
      <input
        class="input input-sm w-full"
        list="{uid}-{kind}"
        aria-label={m.dep_add({ kind: LABELS[kind]() })}
        placeholder={m.dep_add({ kind: LABELS[kind]() })}
        onkeydown={e => {
          if (e.key === "Enter") {
            e.preventDefault()
            add(kind, e.currentTarget)
          }
        }}
        onchange={e => add(kind, e.currentTarget)}
      />
      <datalist id="{uid}-{kind}">
        {#each (suggest[kind] ?? []).filter(n => !(value[kind] ?? []).includes(n)) as name (name)}
          <option value={name}></option>
        {/each}
      </datalist>
    </div>
  {/each}
</div>
