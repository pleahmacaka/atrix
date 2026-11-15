import { Marked } from "marked"

const markdown = new Marked({ async: false, gfm: true })

export const plainText = (text: string) => {
  const html = markdown.parse(text, { async: false })
  const body = new DOMParser().parseFromString(html, "text/html").body

  return (body.textContent ?? "").split(/\s+/).filter(Boolean).join(" ")
}
