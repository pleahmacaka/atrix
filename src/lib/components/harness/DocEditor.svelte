<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"

let {
  file,
  content,
  onSave,
}: {
  file: string
  content: string
  onSave: (content: string) => Promise<unknown>
} = $props()

const name = $derived(baseName(file))

const placeholder = $derived(m.harness_doc_placeholder({ file: name }))

const attempt = new Attempt()

let saved = $state("")

let draft = $state("")

$effect.pre(() => {
  saved = content
  draft = content
})

const dirty = $derived(draft !== saved)

const save = () =>
  attempt.run(async () => {
    await onSave(draft)
    saved = draft
  })
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <div class="flex items-center gap-2 text-xs text-base-content/60">
    <Icon icon="lucide:file-text" class="size-4 shrink-0" />
    <span class="min-w-0 flex-1 truncate" title={file}>{file}</span>
    <IconButton
      icon="lucide:save"
      label={m.common_save()}
      title={m.harness_applies_next()}
      tone="primary"
      disabled={!dirty || attempt.busy}
      onclick={save}
    />
  </div>
  <textarea
    class={[
      "textarea min-h-0 w-full flex-1 resize-none overflow-x-hidden overflow-y-auto text-sm",
      "tab-4 leading-relaxed break-words whitespace-pre-wrap tabular-nums",
    ]}
    {placeholder}
    spellcheck="false"
    aria-label={file}
    bind:value={draft}
    onkeydown={e => {
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        save()
      }
    }}
  ></textarea>
  <ErrorAlert message={attempt.failure} />
</div>
