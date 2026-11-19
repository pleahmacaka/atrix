import type { HostView } from "#lib/p2p/hostView.svelte.ts"

export const matchChoice = (
  values: { value: string; name: string }[],
  wanted: string,
) =>
  !wanted
    ? undefined
    : (values.find(v => v.value === wanted)?.value ??
      values.find(v =>
        `${v.value} ${v.name}`.toLowerCase().includes(wanted.toLowerCase()),
      )?.value)

export type Choices = {
  options?: Record<string, string>
  model?: string
  effort?: string
}

export const applyChoices = async (
  view: HostView,
  id: string,
  choices: Choices,
) => {
  const config = () => view.views[id]?.config ?? []
  const options = choices.options ?? {}
  const covered = new Set<string>()

  for (const [configId, value] of Object.entries(options)) {
    const option = config().find(o => o.id === configId)

    if (option?.category) {
      covered.add(option.category)
    }

    if (option && value !== option.current) {
      await view.configure(id, configId, value)
    }
  }

  const wants: [string, string | undefined][] = [
    ["model", choices.model],
    ["thought_level", choices.effort],
  ]

  for (const [category, wanted] of wants) {
    const option = covered.has(category)
      ? undefined
      : config().find(o => o.category === category)
    const value =
      option && wanted ? matchChoice(option.values, wanted) : undefined

    if (option && value && value !== option.current) {
      await view.configure(id, option.id, value)
    }
  }
}
