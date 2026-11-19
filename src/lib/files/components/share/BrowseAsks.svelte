<script lang="ts">
  import Icon from "@iconify/svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { shareError } from "./errors"
  import { type Answer, answerBrowse } from "./share"
  import { share } from "./share.svelte"

  const ANSWERS: { answer: Answer; label: () => string; tone: string }[] = [
    { answer: "once", label: m.files_devices_allow_once, tone: "btn-primary" },
    { answer: "always", label: m.files_devices_allow_always, tone: "btn-soft" },
    { answer: "deny", label: m.files_devices_deny, tone: "btn-ghost" },
  ]

  const reply = (device: string, answer: Answer) =>
    answerBrowse(device, answer).catch(reason =>
      toast(shareError(reason), "error"),
    )
</script>

<ul class="flex flex-col">
  {#each share.state.browseAsks as ask (ask.id)}
    {@const text = m.files_devices_browse_request({ name: ask.name })}

    <li class="flex flex-col gap-2 py-3">
      <span class="flex min-w-0 items-center gap-2 text-sm">
        <Icon icon="lucide:folder-search" class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 truncate" title={text}>{text}</span>
      </span>

      <div class="flex flex-wrap gap-2">
        {#each ANSWERS as option (option.answer)}
          <button
            type="button"
            class={["btn btn-sm", option.tone]}
            onclick={() => reply(ask.id, option.answer)}
          >
            {option.label()}
          </button>
        {/each}
      </div>
    </li>
  {/each}
</ul>
