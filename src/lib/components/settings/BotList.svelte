<script lang="ts">
import { type Bot, channels, removeBot, saveBot } from "#lib/channels/store.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"

let {
  nameOf,
  onchat,
  onedit,
}: {
  nameOf: (id: string) => string
  onchat: (bot: Bot) => void
  onedit: (bot: Bot) => void
} = $props()

const togglePause = (bot: Bot) => saveBot({ ...bot, paused: !bot.paused })
</script>

{#if channels.bots.length > 0}
  <ul class="flex flex-col px-2 pb-2">
    {#each channels.bots as bot (bot.id)}
      <li class="flex min-w-0 items-center gap-3 rounded-field px-2 py-1.5 hover:bg-base-content/5">
        <span
          class={[
            "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
            bot.paused ? "bg-base-content/10 text-base-content/50" : "bg-primary/15 text-primary",
          ]}
        >
          {[...bot.name][0]?.toUpperCase() ?? "?"}
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate text-sm font-medium" title={bot.name}>{bot.name}</span>
            {#if bot.paused}
              <span class="badge badge-ghost badge-sm shrink-0">{m.bot_paused()}</span>
            {/if}
          </span>
          <span class="flex min-w-0 items-center gap-2 text-xs text-base-content/60">
            <span class="shrink-0">{nameOf(bot.harness)}</span>
            <span class="min-w-0 truncate" title={bot.cwd}>{baseName(bot.cwd)}</span>
            <span class="shrink-0 tabular-nums">
              {m.bot_counts({ channels: bot.channels.length, members: bot.members.length })}
            </span>
          </span>
        </span>
        <IconButton icon="lucide:message-square" label={m.bot_main_chat()} onclick={() => onchat(bot)} />
        <IconButton
          icon={bot.paused ? "lucide:play" : "lucide:pause"}
          label={bot.paused ? m.bot_resume() : m.bot_pause()}
          onclick={() => togglePause(bot)}
        />
        <IconButton icon="lucide:pencil" label={m.bot_edit()} onclick={() => onedit($state.snapshot(bot))} />
        <ConfirmButton label={m.channels_remove()} onconfirm={() => removeBot(bot.id)} />
      </li>
    {/each}
  </ul>
{/if}