import type { FileUIPart } from "ai"
import type { Attachment } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const MAX_BYTES = 10 * 1024 * 1024

export const isImage = (file: File) => file.type.startsWith("image/")

const checkSize = (file: File) => {
  if (file.size > MAX_BYTES) {
    throw new Error(m.error_attachment_size({ name: file.name }))
  }
}

const kindOf = async (file: File): Promise<Attachment["kind"]> => {
  if (isImage(file)) {
    return "image"
  }

  return (await file.text()).includes("\u0000") ? "file" : "text"
}

const base64Of = async (file: File) =>
  new Uint8Array(await file.arrayBuffer()).toBase64()

export const toAttachment = async (file: File): Promise<Attachment> => {
  checkSize(file)

  const kind = await kindOf(file)

  if (kind === "text") {
    return {
      kind,
      name: file.name,
      mimeType: file.type || "text/plain",
      text: await file.text(),
    }
  }

  return {
    kind,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: await base64Of(file),
  }
}

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const toFilePart = async (
  file: File,
  url = dataUrl(file),
): Promise<FileUIPart> => {
  checkSize(file)

  return {
    type: "file",
    mediaType: file.type || "text/plain",
    filename: file.name,
    url: await url,
  }
}
