import type { FileUIPart } from "ai"
import type { Attachment } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const MAX_BYTES = 10 * 1024 * 1024

const BINARY_MARK = "\u0000"

const checkSize = (file: File) => {
  if (file.size > MAX_BYTES) {
    throw new Error(m.error_attachment_size({ name: file.name }))
  }
}

export const isImage = (file: File) => file.type.startsWith("image/")

export const toAttachment = async (file: File): Promise<Attachment> => {
  checkSize(file)

  if (isImage(file)) {
    const bytes = new Uint8Array(await file.arrayBuffer())

    return {
      kind: "image",
      name: file.name,
      mimeType: file.type,
      data: bytes.toBase64(),
    }
  }

  const text = await file.text()

  if (text.includes(BINARY_MARK)) {
    throw new Error(m.error_attachment_type({ name: file.name }))
  }

  return {
    kind: "text",
    name: file.name,
    mimeType: file.type || "text/plain",
    text,
  }
}

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const toFilePart = async (file: File): Promise<FileUIPart> => {
  checkSize(file)

  return {
    type: "file",
    mediaType: file.type || "text/plain",
    filename: file.name,
    url: await dataUrl(file),
  }
}
