<script lang="ts">
import { untrack } from "svelte"
import { withPrimer } from "#lib/agents/agents.svelte.ts"
import { appTitleOf } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import { toAttachment } from "#lib/chat/attachments.ts"
import type { Block } from "#lib/chat/blocks.ts"
import { drainFailures } from "#lib/chat/queue.svelte.ts"
import { pinToggles, stickBottom } from "#lib/chat/scroll.ts"
import { segmentsOf, turnsOf } from "#lib/chat/session.ts"
import { openThread, startThread, threadsOf } from "#lib/chat/threads.svelte.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isGoneError } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import PcbSide from "#lib/pcb/PcbSide.svelte"
import { openConversation } from "#lib/store/nav.svelte.ts"
import { panes, usePane } from "#lib/store/panes.svelte.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import AgentReply from "./AgentReply.svelte"
import ChatTimeline from "./ChatTimeline.svelte"
import Composer from "./Composer.svelte"
import PermissionCard from "./PermissionCard.svelte"
import PlanCard from "./PlanCard.svelte"
import QuestionCard from "./QuestionCard.svelte"
import QueuedPrompts from "./QueuedPrompts.svelte"
import RunningStatus from "./RunningStatus.svelte"
import SessionTools from "./SessionTools.svelte"
import SidePanel from "./SidePanel.svelte"
import ThoughtNote from "./ThoughtNote.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UiBlocks from "./UiBlocks.svelte"
import UserPrompt from "./UserPrompt.svelte"
import VoiceConversation from "./VoiceConversation.svelte"

let { host, sessionId }: { host: HostView; sessionId: string } = $props()

const pane = usePane()

const tries = new Attempt()

const attempt = tries.run

$effect(() => {
  void sessionId
  tries.failure = null
})

const view = $derived(host.views[sessionId])

const elsewhere = $derived(host.elsewhere(sessionId))

const talking = $derived(conversation.owner === sessionId)

$effect(() => {
  if (!talking) {
    return
  }

  untrack(() => conversation.shown++)

  return () => {
    conversation.shown--
  }
})

const segments = $derived(segmentsOf(view?.items ?? []))

const turns = $derived(turnsOf(view?.items ?? []))

const queued = $derived(view?.queued ?? [])

let scroller = $state<HTMLElement>()

const send = (text: string, files: File[] = []) =>
  attempt(async () => {
    const attachments = await Promise.all(files.map(toAttachment))

    try {
      await host.prompt(sessionId, withPrimer(sessionId, text), attachments)
    } catch (e) {
      if (!isGoneError(e) || !view) {
        throw e
      }

      const id = await host.create(view.harness, view.cwd)

      const next = { kind: "session" as const, host: host.id, id }

      if (pane) {
        panes.open(next, pane())
      } else {
        openConversation(next)
      }

      await host.prompt(id, text, attachments)
    }
  })

const reply = (text: string) => attempt(() => host.prompt(sessionId, text))

const permit = (optionId: string) => attempt(() => host.permit(sessionId, optionId))

const saveApp = (blocks: Block[]) =>
  apps.save(appTitleOf(blocks, view?.title ?? ""), blocks)

$effect(() => {
  host.loadDatasources().catch(() => {})
})
</script>

{#if view}
  <div class="relative flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {#if talking && conversation.full}
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
              {#each segments as segment, i (segment.key)}
                {#if segment.kind === "activity"}
                  <ToolGroup items={segment.items} latest={i === segments.length - 1} />
                {:else if segment.item.type === "user"}
                  <UserPrompt item={segment.item} />
                {:else if segment.item.type === "agent"}
                  <AgentReply
                    text={segment.item.text}
                    pace={segment.item.pace}
                    onAction={reply}
                    onSave={saveApp}
                    threads={threadsOf(sessionId, segment.item.id).length}
                    onThread={() => {
                      const item = segment.item

                      if (view && item.type === "agent") {
                        attempt(() =>
                          startThread(host, host.id, view, { id: item.id, text: item.text }),
                        )
                      }
                    }}
                    onOpenThread={() => {
                      const latest = threadsOf(sessionId, segment.item.id).at(-1)

                      if (latest) {
                        openThread(latest.host, latest.session)
                      }
                    }}
                  />
                {:else if segment.item.type === "thought"}
                  <ThoughtNote text={segment.item.text} />
                {:else if segment.item.type === "plan"}
                  <PlanCard entries={segment.item.entries} />
                {:else if segment.item.type === "ui"}
                  <UiBlocks blocks={segment.item.blocks} onAction={reply} onSave={saveApp} />
                {/if}
              {/each}
              <QueuedPrompts {queued} images={view.queuedImages} />
              {#if view.running && !view.ask}
                <RunningStatus
                  since={view.since}
                  tokens={view.tokens}
                  pace={view.pace}
                  agents={view.agents}
                />
              {/if}
              {#if view.ask}
                <PermissionCard ask={view.ask} onPermit={permit} />
              {/if}
              {#if view.asked}
                {#key view.asked.id}
                  <QuestionCard
                    asked={view.asked}
                    onAnswer={async answers => {
                      const id = view?.asked?.id

                      return !!id && (await attempt(() => host.answer(sessionId, id, answers)))
                    }}
                  />
                {/key}
              {/if}
              <ErrorAlert message={tries.failure ?? drainFailures[sessionId] ?? null} />
            </div>
          </div>
          <ChatTimeline {scroller} {turns} />
        </div>
      {/if}
      <Composer
        busy={!!view.running && !elsewhere}
        running={!!view.running}
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
    {#if panes.hasSide(pane?.())}
      <SidePanel
        entries={view.items.flatMap(i => (i.type === "ui" ? [{ id: i.id, blocks: i.blocks }] : []))}
        {host}
        cwd={view.cwd}
        onAction={reply}
        onSave={saveApp}
      />
    {/if}
    <PcbSide cwd={view.cwd} />
  </div>
{:else}
  <div class="grid flex-1 place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </div>
{/if}
