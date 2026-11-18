export type JsonToken = {
  text: string
  kind: "key" | "string" | "literal" | "number" | "plain"
}

const LITERALS = ["true", "false", "null"]

const isDigit = (c: string | undefined) => !!c && c >= "0" && c <= "9"

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c)

const numberEnd = (text: string, from: number) => {
  let at = from + 1

  while (at < text.length) {
    const c = text[at]
    const exponent = c === "e" || c === "E"
    const sign = (c === "+" || c === "-") && "eE".includes(text[at - 1])

    if (!(isDigit(c) || c === "." || exponent || sign)) {
      break
    }

    at += 1
  }

  return at
}

const literalAt = (text: string, at: number) =>
  LITERALS.find(
    word =>
      text.startsWith(word, at) &&
      !isWordChar(text[at - 1]) &&
      !isWordChar(text[at + word.length]),
  )

const stringEnd = (text: string, from: number) => {
  let at = from + 1

  while (at < text.length && text[at] !== '"') {
    at += text[at] === "\\" ? 2 : 1
  }

  return Math.min(at + 1, text.length)
}

const isKey = (text: string, from: number) => {
  let at = from

  while (at < text.length && " \t\r\n".includes(text[at])) {
    at += 1
  }

  return text[at] === ":"
}

export const jsonTokens = (text: string): JsonToken[] => {
  const tokens: JsonToken[] = []
  let plain = 0
  let at = 0

  const flush = () => {
    if (plain < at) {
      tokens.push({ text: text.slice(plain, at), kind: "plain" })
    }
  }

  const push = (kind: JsonToken["kind"], end: number) => {
    flush()
    tokens.push({ text: text.slice(at, end), kind })
    at = end
    plain = end
  }

  while (at < text.length) {
    const c = text[at]

    if (c === '"') {
      const end = stringEnd(text, at)

      push(isKey(text, end) ? "key" : "string", end)
    } else if (
      (isDigit(c) || (c === "-" && isDigit(text[at + 1]))) &&
      !isWordChar(text[at - 1])
    ) {
      push("number", numberEnd(text, at))
    } else {
      const literal = literalAt(text, at)

      if (literal) {
        push("literal", at + literal.length)
      } else {
        at += 1
      }
    }
  }

  flush()

  return tokens
}

const CLOSERS: Record<string, string> = { "{": "\n}", "[": "\n]" }

export const splitJson = (detail: string, streaming = false) => {
  const closer = CLOSERS[detail[0] ?? ""]
  const second = detail[1] === "\r" ? detail[2] : detail[1]

  if (!closer || second !== "\n") {
    return { json: "", rest: detail }
  }

  const end = detail.indexOf(closer)

  if (end === -1) {
    return streaming ? { json: detail, rest: "" } : { json: "", rest: detail }
  }

  return { json: detail.slice(0, end + 2), rest: detail.slice(end + 2).trim() }
}
