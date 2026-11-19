import type { TerminalDialog } from "#lib/p2p/protocol.ts"

type Option = TerminalDialog["options"][number]

const RULES = ["─", "╌", "▔"]

const SELECTED = "❯"

const CHECKBOXES = ["[ ]", "[x]", "[X]", "[✓]", "[✔]"]

const COMMANDS = ["/model ", "/effort "]

const PROMPTS = ["Switch model?", "Change effort level?"]

const HOOK = "hook asked you to confirm"

const isRule = (line: string) =>
  line.length > 8 && [...line].every(c => RULES.includes(c))

const optionOf = (line: string): Option | null => {
  const trimmed = line.trim()
  const current = trimmed.startsWith(SELECTED)
  const body = current ? trimmed.slice(SELECTED.length).trim() : trimmed
  const digit = Number(body.at(0))

  return body.at(1) === "." && body.at(2) === " " && digit >= 1 && digit <= 9
    ? { digit, label: body.slice(3).trim(), detail: "", current }
    : null
}

const isTurn = (line: string) => {
  const trimmed = line.trimStart()
  const pointed = trimmed.startsWith(`${SELECTED} `)

  return (
    line.startsWith("●") ||
    (pointed &&
      trimmed.at(SELECTED.length + 1) !== " " &&
      optionOf(trimmed) === null)
  )
}

export const isCheckbox = (label: string) =>
  CHECKBOXES.some(box => label.startsWith(box))

const dialogArea = (screen: string[]) => {
  const rows = screen.map(l => l.trimEnd())
  const turn = rows.findLastIndex(isTurn)
  const rule = rows.findIndex((l, i) => i > turn && isRule(l))

  return rule === -1
    ? []
    : rows.slice(rule + 1).filter(l => l.trim() && !isRule(l))
}

const tailRun = (body: string[]) => {
  const last = body.findLastIndex(l => optionOf(l) !== null)
  const first = body.findIndex((l, i) => i <= last && optionOf(l)?.digit === 1)

  return first === -1 ? last : first
}

export const claudeDialog = (screen: string[]): TerminalDialog | null => {
  const body = dialogArea(screen)

  if (body.length === 0 || body.some(l => l.trim() === SELECTED)) {
    return null
  }

  const first = tailRun(body)
  const lines: string[] = []
  const options: TerminalDialog["options"] = []

  body.forEach((row, i) => {
    const pointed = row.startsWith(SELECTED) && optionOf(row) === null
    const l = pointed ? ` ${row.slice(SELECTED.length)}` : row
    const option = i >= first ? optionOf(l) : null
    const last = options.at(-1)

    if (option) {
      options.push(option)
    } else if (last && l.startsWith("   ")) {
      last.detail = [last.detail, l.trim()].filter(Boolean).join(" ")
    } else if (options.length === 0) {
      lines.push(l.trim())
    }
  })

  return lines.length || options.length ? { lines, options } : null
}

export const claudeConfirm = {
  command: (text: string) => COMMANDS.some(c => text.startsWith(c)),
  showing: (screen: string[]) => {
    const area = dialogArea(screen)

    return (
      area.some(l => PROMPTS.some(p => l.includes(p))) &&
      !area.some(l => l.includes(HOOK))
    )
  },
}
