import { Node } from "@tiptap/core"
import { ID_SOURCE } from "./document.ts"

const PATTERN = new RegExp(`^\\[\\[(${ID_SOURCE})(?:\\|([^\\]]*))?\\]\\]`)

type Options = {
  title: (id: string) => string | null
  open: (id: string) => void
}

export const WikiLink = Node.create<Options>({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { title: () => null, open: () => {} }
  },

  addAttributes() {
    return { id: { default: "" }, alias: { default: null } }
  },

  parseHTML() {
    return [
      {
        tag: "a[data-kg]",
        getAttrs: node => ({
          id: node.getAttribute("data-kg"),
          alias: node.getAttribute("data-alias"),
        }),
      },
    ]
  },

  renderHTML({ node }) {
    const { id, alias } = node.attrs
    const label = alias || this.options.title(id) || id

    return [
      "a",
      { "data-kg": id, "data-alias": alias, class: "wikilink", href: "#" },
      label,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const { id, alias } = node.attrs
      const dom = document.createElement("a")

      dom.className = "wikilink"
      dom.href = "#"
      dom.dataset.kg = id
      dom.textContent = alias || this.options.title(id) || id
      dom.addEventListener("click", e => {
        e.preventDefault()
        this.options.open(id)
      })

      return { dom }
    }
  },

  markdownTokenizer: {
    name: "wikilink",
    level: "inline",
    start: src => src.indexOf("[["),
    tokenize: src => {
      const match = PATTERN.exec(src)

      return match
        ? {
            type: "wikilink",
            raw: match[0],
            id: match[1],
            alias: match[2] ?? null,
          }
        : undefined
    },
  },

  parseMarkdown: token => ({
    type: "wikilink",
    attrs: { id: token.id, alias: token.alias },
  }),

  renderMarkdown: node =>
    node.attrs?.alias
      ? `[[${node.attrs.id}|${node.attrs.alias}]]`
      : `[[${node.attrs?.id}]]`,
})
