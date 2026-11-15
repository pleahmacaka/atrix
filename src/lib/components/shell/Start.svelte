<script lang="ts">
import { chats } from "#lib/chat/chats.svelte.ts"
import Composer from "#lib/components/chat/Composer.svelte"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Wheel from "#lib/components/ui/Wheel.svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { findGateway } from "#lib/store/gateways.svelte.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import FolderPicker from "./FolderPicker.svelte"
import { GATEWAY, gatewayKey, harnessKey, targetsOf } from "./targets.ts"

const attempt = new Attempt()

const hosts = $derived(hostList())

const options = $derived(targetsOf(hosts))

const targetKey = $derived(
  nav.target.kind === "model"
    ? gatewayKey(nav.target.gateway)
    : harnessKey(nav.target.host, nav.target.harness),
)

const choose = (key: string) => {
  const [first, second] = key.split("\n")

  if (first === GATEWAY) {
    nav.target = {
      kind: "model",
      gateway: second,
      model:
        chats.list.find(c => c.gateway === second)?.model ??
        findGateway(second)?.model ??
        "",
    }

    return
  }

  nav.target = {
    kind: "harness",
    host: first,
    harness: second,
    cwd: hostById(first)?.state?.home ?? "",
  }
}

$effect(() => {
  if (options.length > 0 && !options.some(o => o.key === targetKey)) {
    choose(options[0].key)
  }
})

const send = (text: string, files: File[]) =>
  attempt.run(async () => {
    const target = nav.target

    if (target.kind === "model") {
      const id = chats.create(target.gateway, target.model)
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
  nav.target.kind === "model" ? !!findGateway(nav.target.gateway) : true,
)
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
  <p class="text-2xl font-medium text-base-content/80">{m.chat_prompt()}</p>
  <div class="w-full">
    <Composer
      busy={attempt.busy}
      draft="start"
      disabled={!ready}
      placeholder={ready ? m.chat_placeholder() : m.chat_connect_gateway()}
      onSend={send}
      onStop={() => {}}
    >
      {#snippet side()}
        <Wheel
          items={options}
          value={targetKey}
          label={m.target_title()}
          onpick={choose}
        />
      {/snippet}
      {#snippet tools()}
        {#if nav.target.kind === "model"}
          <ModelInput
            gateway={nav.target.gateway}
            bind:value={nav.target.model}
          />
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
