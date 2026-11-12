<script lang="ts">
import { chats, DEFAULT_MODEL } from "#lib/chat/chats.svelte.ts"
import Composer from "#lib/components/chat/Composer.svelte"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local } from "#lib/store/local.svelte.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import FolderPicker from "./FolderPicker.svelte"
import TargetPicker from "./TargetPicker.svelte"

const OPENROUTER = "openrouter"

const attempt = new Attempt()

const hosts = $derived(hostList())

const targetKey = $derived(
  nav.target.kind === "openrouter"
    ? OPENROUTER
    : `${nav.target.host}\n${nav.target.harness}`,
)

const choose = (key: string) => {
  if (key === OPENROUTER) {
    nav.target = { kind: "openrouter", model: chats.list[0]?.model ?? DEFAULT_MODEL }

    return
  }

  const [host, harness] = key.split("\n")

  nav.target = {
    kind: "harness",
    host,
    harness,
    cwd: hostById(host)?.state?.home ?? "",
  }
}

const send = (text: string, files: File[]) =>
  attempt.run(async () => {
    const target = nav.target

    if (target.kind === "openrouter") {
      const id = chats.create(target.model)
      const stored = chats.find(id)
      const { chatFor } = await import("#lib/chat/live.svelte.ts")

      if (stored) {
        const { toFilePart } = await import("#lib/chat/attachments.ts")

        chatFor(stored).sendMessage({
          text,
          files: await Promise.all(files.map(toFilePart)),
        })
      }

      openConversation({ kind: "chat", id })

      return
    }

    const view = hostById(target.host)

    if (!view) {
      throw new Error(m.chat_no_device())
    }

    const id = await view.create(target.harness, target.cwd.trim())

    openConversation({ kind: "session", host: target.host, id })
    const { toAttachment } = await import("#lib/chat/attachments.ts")

    await view.prompt(id, text, await Promise.all(files.map(toAttachment)))
  })

const ready = $derived(
  nav.target.kind === "openrouter" ? !!local.data.openrouter.key : true,
)
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
  <p class="text-2xl font-medium text-base-content/80">{m.chat_prompt()}</p>
  <div class="w-full max-w-3xl">
    <Composer
      busy={attempt.busy}
      disabled={!ready}
      placeholder={ready ? m.chat_placeholder() : m.chat_connect_openrouter()}
      onSend={send}
      onStop={() => {}}
    >
      {#snippet tools()}
        <TargetPicker {hosts} value={targetKey} onpick={choose} />
        {#if nav.target.kind === "openrouter"}
          <ModelInput bind:value={nav.target.model} />
        {:else}
          <FolderPicker
            host={hostById(nav.target.host)}
            bind:value={nav.target.cwd}
          />
        {/if}
      {/snippet}
    </Composer>
    <ErrorAlert message={attempt.failure} />
  </div>
</div>
