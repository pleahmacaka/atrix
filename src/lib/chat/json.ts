export type JsonToken = {
  text: string
  kind: "key" | "string" | "literal" | "number" | "plain"
}

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

export const jsonTokens = (text: string): JsonToken[] => {
  const tokens: JsonToken[] = []
  let at = 0

  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0

    if (start > at) {
      tokens.push({ text: text.slice(at, start), kind: "plain" })
    }

    const [whole, quoted, colon] = match

    if (quoted) {
      tokens.push({ text: quoted, kind: colon ? "key" : "string" })

      if (colon) {
        tokens.push({ text: colon, kind: "plain" })
      }
    } else {
      tokens.push({
        text: whole,
        kind:
          /\d/.test(whole[0] ?? "") || whole[0] === "-" ? "number" : "literal",
      })
    }

    at = start + whole.length
  }

  if (at < text.length) {
    tokens.push({ text: text.slice(at), kind: "plain" })
  }

  return tokens
}

export const splitJson = (detail: string) => {
  const end = detail.startsWith("{") ? detail.indexOf("\n}") : -1

  if (end === -1) {
    return { json: "", rest: detail }
  }

  return { json: detail.slice(0, end + 2), rest: detail.slice(end + 2).trim() }
}
