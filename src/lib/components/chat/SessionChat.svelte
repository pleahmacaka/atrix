<script lang="ts">
import { appTitleOf } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import { toAttachment } from "#lib/chat/attachments.ts"
import type { Block } from "#lib/chat/blocks.ts"
import { drainFailures, queues } from "#lib/chat/queue.svelte.ts"
import { pinToggles, stickBottom } from "#lib/chat/scroll.ts"
import { segmentsOf, turnsOf } from "#lib/chat/session.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import PcbSide from "#lib/pcb/PcbSide.svelte"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import AgentReply from "./AgentReply.svelte"
import ChatTimeline from "./ChatTimeline.svelte"
import Composer from "./Composer.svelte"
import PermissionCard from "./PermissionCard.svelte"
import PlanCard from "./PlanCard.svelte"
import QueuedPrompts from "./QueuedPrompts.svelte"
import RunningStatus from "./RunningStatus.svelte"
import SessionTools from "./SessionTools.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UiBlocks from "./UiBlocks.svelte"
import UserPrompt from "./UserPrompt.svelte"
import VoiceConversation from "./VoiceConversation.svelte"

let { host, sessionId }: { host: HostView; sessionId: string } = $props()

const tries = new Attempt()

const attempt = tries.run

const view = $derived(host.views[sessionId])

const elsewhere = $derived(host.elsewhere(sessionId))

const talking = $derived(conversation.owner === sessionId)

const segments = $derived(segmentsOf(view?.items ?? []))

const turns = $derived(turnsOf(view?.items ?? []))

const queued = $derived([...(view?.queued ?? []), ...queues.get(sessionId)])

let scroller = $state<HTMLElement>()

const send = (text: string, files: File[] = []) =>
  attempt(async () =>
    host.prompt(sessionId, text, await Promise.all(files.map(toAttachment))),
  )

const reply = (text: string) => attempt(() => host.prompt(sessionId, text))

const permit = (optionId: string) => attempt(() => host.permit(sessionId, optionId))

const saveApp = (blocks: Block[]) =>
  apps.save(appTitleOf(blocks, view?.title ?? ""), blocks)

$effect(() => {
  host.loadDatasources().catch(() => {})
})
</script>

{#if view}
  <div class="flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {#if talking}
        <VoiceConversation {view} onPermit={permit} />
      {:else}
        <div class="@container relative flex min-h-0 flex-1 flex-col">
          <div
            bind:this={scroller}
            class="scroll-centered flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
            {@attach pinToggles}
            {@attach stickBottom}
          >
            <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
              {#each segments as segment (segment.key)}
                {#if segment.kind === "activity"}
                  <ToolGroup items={segment.items} />
                {:else if segment.item.type === "user"}
                  <UserPrompt item={segment.item} />
                {:else if segment.item.type === "agent"}
                  <AgentReply text={segment.item.text} onAction={reply} onSave={saveApp} />
                {:else if segment.item.type === "plan"}
                  <PlanCard entries={segment.item.entries} />
                {:else if segment.item.type === "ui"}
                  <UiBlocks blocks={segment.item.blocks} onAction={reply} onSave={saveApp} />
                {/if}
              {/each}
              {#if view.running && !view.ask}
                <RunningStatus since={view.since} tokens={view.tokens} agents={view.agents} />
              {/if}
              <QueuedPrompts {queued} />
              {#if view.ask}
                <PermissionCard ask={view.ask} onPermit={permit} />
              {/if}
              <ErrorAlert message={tries.failure ?? drainFailures[sessionId] ?? null} />
            </div>
          </div>
          <ChatTimeline {scroller} {turns} />
        </div>
      {/if}
      <Composer
        busy={!!view.running && !elsewhere}
        datasources={host.datasources}
        queue
        converse={{ host: host.id }}
        draft={sessionId}
        placeholder={m.chat_placeholder()}
        commands={view.commands}
        onSend={send}
        onStop={() => attempt(() => host.cancel(sessionId))}
      >
        {#snippet tools()}
          <SessionTools {host} {view} {elsewhere} {attempt} {send} />
        {/snippet}
      </Composer>
    </div>
    <PcbSide cwd={view.cwd} />
  </div>
{:else}
  <div class="grid flex-1 place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </div>
{/if}
