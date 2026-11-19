<script lang="ts">
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import { type McpServer, mcpServer } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

type Kind = McpServer["transport"]["type"]

let {
  open = $bindable(false),
  server,
  taken,
  onsave,
  onremove,
}: {
  open?: boolean
  server: McpServer | null
  taken: string[]
  onsave: (server: McpServer) => void
  onremove: () => void
} = $props()

const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: "stdio", label: m.agent_server_stdio(), icon: "lucide:terminal" },
  { id: "http", label: m.agent_server_http(), icon: "lucide:globe" },
  { id: "sse", label: m.agent_server_sse(), icon: "lucide:radio" },
]

let name = $state("")

let kind = $state<Kind>("stdio")

let target = $state("")

$effect.pre(() => {
  if (!open) {
    return
  }

  const transport = server?.transport

  name = server?.name ?? ""
  kind = transport?.type ?? "stdio"
  target =
    transport?.type === "stdio"
      ? [transport.command, ...transport.args].join(" ")
      : (transport?.url ?? "")
})

const built = $derived.by(() => {
  const previous = server?.transport

  if (kind === "stdio") {
    const [command = "", ...args] = target.split(" ").filter(Boolean)
    const env = previous?.type === "stdio" ? previous.env : {}

    return mcpServer.safeParse({ name, transport: { type: kind, command, args, env } })
  }

  const headers = previous && previous.type !== "stdio" ? previous.headers : {}

  return mcpServer.safeParse({ name, transport: { type: kind, url: target.trim(), headers } })
})

const valid = $derived(
  built.success && (built.data.name === server?.name || !taken.includes(built.data.name)),
)
</script>

<Modal bind:open label={server ? m.agent_server_edit() : m.agent_server_new()} class="max-w-lg">
  <form
    class="flex flex-col gap-3 p-5"
    onsubmit={e => {
      e.preventDefault()

      if (built.success && valid) {
        onsave(built.data)
        open = false
      }
    }}
  >
    <h2 class="text-base font-semibold">{server ? m.agent_server_edit() : m.agent_server_new()}</h2>
    <IconInput
      icon="lucide:plug"
      label={m.agent_server_name()}
      placeholder={m.agent_server_name()}
      ghost={false}
      data-autofocus
      bind:value={name}
    />
    <Segmented label={m.agent_server_kind()} items={KINDS} value={kind} onpick={id => (kind = id)} />
    <IconInput
      icon={kind === "stdio" ? "lucide:terminal" : "lucide:link"}
      label={kind === "stdio" ? m.agent_server_command() : m.agent_server_url()}
      placeholder={kind === "stdio" ? m.agent_server_command() : m.agent_server_url()}
      ghost={false}
      bind:value={target}
    />
    <div class="flex items-center gap-2">
      {#if server}
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
