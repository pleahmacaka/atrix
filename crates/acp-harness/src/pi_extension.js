const KEEP_IMAGES = 8

const reasonOf = text => {
  try {
    return JSON.parse(text.slice(text.indexOf("{"))).message ?? text
  } catch {
    return text
  }
}

const withRecentImages = messages => {
  let seen = 0

  const trimmed = messages.toReversed().map(message => {
    if (!Array.isArray(message.content)) {
      return message
    }

    const content = message.content.toReversed().map(part => {
      if (part.type !== "image") {
        return part
      }

      seen += 1

      return seen > KEEP_IMAGES ? { type: "text", text: "[earlier image removed]" } : part
    })

    return { ...message, content: content.toReversed() }
  })

  return seen > KEEP_IMAGES ? trimmed.toReversed() : null
}

export default function (pi) {
  pi.on("context", event => {
    const messages = withRecentImages(event.messages)

    return messages ? { messages } : undefined
  })

  pi.on("message_end", (event, ctx) => {
    const message = event.message

    if (message.role === "assistant" && message.stopReason === "error" && message.errorMessage) {
      ctx.ui.notify(reasonOf(message.errorMessage), "error")
    }
  })
}
