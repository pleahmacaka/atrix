<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { m } from "#lib/paraglide/messages.js"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, PAGES } from "#lib/store/pages.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { keysOf, type ShortcutId, withKeys } from "#lib/store/shortcuts.ts"
import Navigator from "./Navigator.svelte"

let { rail = false }: { rail?: boolean } = $props()

type Action = {
  label: string
  icon: string
  shortcut?: ShortcutId
  pressed?: boolean
  run: () => void
}

const actions: Action[] = $derived([
  {
    label: m.chat_new(),
    icon: "lucide:square-pen",
    shortcut: "new",
    run: () => openConversation(null),
  },
  {
    label: m.chat_search_load(),
    icon: "lucide:search",
    shortcut: "palette",
    run: () => {
      nav.palette = true
    },
  },
  {
    label: APPS_PAGE.label(),
    icon: APPS_PAGE.icon,
    pressed: nav.page === "apps",
    run: () => goPage("apps"),
  },
])

const pages = $derived([
  ...PAGES.map(page => ({
    id: page.id as string,
    label: page.label(),
    icon: page.icon,
    active: nav.page === page.id,
    run: () => goPage(page.id),
  })),
  {
    id: "settings",
    label: m.common_settings(),
    icon: "lucide:settings",
    active: nav.settings,
    run: () => {
      nav.settings = true
    },
  },
])

const toggleLabel = $derived(
  rail ? m.shell_expand_sidebar() : m.shell_close_sidebar(),
)

const hintOf = (action: Action) =>
  action.shortcut ? withKeys(action.label, action.shortcut) : action.label
</script>

{#snippet toggle()}
  <IconButton
    icon={rail ? "lucide:panel-left-open" : "lucide:panel-left"}
    label={toggleLabel}
    title={rail ? null : withKeys(toggleLabel, "sidebar")}
    class="shrink-0"
    {@attach tooltip(() => withKeys(toggleLabel, "sidebar"), () => rail)}
    onclick={shell.toggle}
  />
{/snippet}

{#snippet actionButton(action: Action)}
  <button
    type="button"
    class={[
      "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field text-sm",
      "transition-colors duration-140 hover:bg-base-content/8",
      rail ? "w-8 justify-center" : "flex-1 px-2",
      action.pressed && "bg-primary/8 text-primary hover:bg-primary/8",
    ]}
    aria-label={action.label}
    aria-pressed={action.pressed}
    {@attach tooltip(() => hintOf(action), () => rail)}
    onclick={action.run}
  >
    <Icon icon={action.icon} class="size-4 shrink-0" />
    {#if !rail}
      <span class="min-w-0 flex-1 truncate text-start">{action.label}</span>
      {#if action.shortcut}
        <kbd class="kbd kbd-xs opacity-60">{keysOf(action.shortcut)}</kbd>
      {/if}
    {/if}
  </button>
{/snippet}

<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
  <section class="island flex min-h-0 flex-1 flex-col overflow-hidden">
    <nav
      class={["flex shrink-0 flex-col gap-0.5 p-2", rail && "items-center"]}
      aria-label={m.shell_actions()}
    >
      {#if rail}
        {@render toggle()}
        {#each actions as action (action.icon)}
          {@render actionButton(action)}
        {/each}
      {:else}
        {#each actions as action, i (action.icon)}
          <div class="flex items-center gap-1">
            {@render actionButton(action)}
            {#if i === 0}
              {@render toggle()}
            {/if}
          </div>
        {/each}
      {/if}
    </nav>
    <Navigator {rail} />
  </section>
  <nav
    class={["island flex shrink-0 gap-0.5 p-1.5", rail && "flex-col items-center"]}
    aria-label={m.shell_pages()}
  >
    {#each pages as page (page.id)}
      <IconButton
        icon={page.icon}
        label={page.label}
        title={null}
        shape={rail ? "square" : "wide"}
        class={[
          "transition-colors duration-140",
          !rail && "min-w-0 flex-1 px-0",
          page.active && "bg-primary/8 text-primary hover:bg-primary/8",
        ]}
        aria-current={page.active && page.id !== "settings" ? "page" : undefined}
        {@attach tooltip(() => page.label)}
        onclick={page.run}
      />
    {/each}
  </nav>
</div>
