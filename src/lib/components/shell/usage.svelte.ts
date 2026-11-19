import { untrack } from "svelte"
import { getLocale } from "#lib/paraglide/runtime.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { usageGraph } from "#lib/store/usageGraph.svelte.ts"

const GRADES = [
  "",
  "var(--graph-1)",
  "var(--graph-2)",
  "var(--graph-3)",
  "var(--graph-4)",
]

const dated = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" })

export const createUsage = () => {
  const enabled = $derived(settings.tokscale)
  const days = $derived(usageGraph.days)

  $effect(() => {
    if (settings.tokscale) {
      untrack(() => usageGraph.load())
    }
  })

  return {
    enabled: () => enabled,
    days: () => days,
    total: usageGraph.total,
    gradeOf: (level: number) => (level ? GRADES[level] : undefined),
    dateOf: (day: string) =>
      dated.format(new Date([day, "T00:00:00"].join(""))),
  }
}
