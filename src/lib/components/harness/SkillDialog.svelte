<script lang="ts">
import { validSkillName } from "#lib/agents/sources.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"

type Owned = { name: string; content: string }

let {
  open = $bindable(false),
  skill,
  taken,
  onsave,
  onremove,
}: {
  open?: boolean
  skill: Owned | null
  taken: string[]
  onsave: (skill: Owned) => void
  onremove: () => void
} = $props()

let name = $state("")

let content = $state("")

$effect.pre(() => {
  if (open) {
    name = skill?.name ?? ""
    content = skill?.content ?? ""
  }
})

const trimmed = $derived(name.trim())

const valid = $derived(validSkillName(trimmed) && (trimmed === skill?.name || !taken.includes(trimmed)))

const template = (skillName: string) =>
  `---\nname: ${skillName}\ndescription: ${m.harness_skill_template()}\n---\n\n`

const save = () => {
  onsave({ name: trimmed, content: content.trim() ? content : template(trimmed) })
  open = false
}
</script>

<Modal bind:open label={skill ? m.agent_skill_edit() : m.agent_skill_new()} class="max-w-2xl">
  <form
    class="flex flex-col gap-3 p-5"
    onsubmit={e => {
      e.preventDefault()
      save()
    }}
  >
    <h2 class="text-base font-semibold">{skill ? m.agent_skill_edit() : m.agent_skill_new()}</h2>
    <IconInput
      icon="lucide:sparkles"
      label={m.agent_skill_name()}
      placeholder={m.agent_skill_name()}
      ghost={false}
      data-autofocus
      bind:value={name}
    />
    <textarea
      class="textarea h-64 w-full resize-none text-sm leading-relaxed"
      aria-label={m.agent_skill_body()}
      placeholder={m.agent_skill_body()}
      spellcheck="false"
      bind:value={content}
    ></textarea>
    <div class="flex items-center gap-2">
      {#if skill}
        <ConfirmButton
          label={m.common_delete()}
          labeled
          onconfirm={() => {
            onremove()
            open = false
          }}
        />
      {/if}
      <span class="flex-1"></span>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (open = false)}>
        {m.common_cancel()}
      </button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={!valid}>
        {m.common_save()}
      </button>
    </div>
  </form>
</Modal>
