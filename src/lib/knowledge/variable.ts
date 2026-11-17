import { computePosition, flip, offset, shift } from "@floating-ui/dom"
import { Node } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion"

const NAME = /^[a-zA-Z_][\w]*$/

const PATTERN = /^\{\{([a-zA-Z_][\w]*)\}\}/

export const BUILTIN_VARIABLES = ["date", "time", "agent_name", "cwd"]

export const variablesIn = (text: string) => [
  ...new Set([...text.matchAll(/\{\{([a-zA-Z_][\w]*)\}\}/g)].map(m => m[1])),
]

export const fillVariables = (text: string, values: Record<string, string>) =>
  text.replaceAll(/\{\{([a-zA-Z_][\w]*)\}\}/g, (whole, name: string) =>
    name in values ? values[name] : whole,
  )

type Options = { items: () => string[] }

const menu = () => {
  const box = document.createElement("div")

  box.className =
    "popover-box fixed z-50 flex max-h-56 w-56 flex-col overflow-y-auto p-1 text-sm"
  box.setAttribute("role", "listbox")
  document.body.append(box)

  let active = 0
  let props: SuggestionProps<string> | null = null

  const draw = () => {
    if (!props) {
      return
    }

    const current = props
    const names = current.items

    box.replaceChildren(
      ...names.map((name, i) => {
        const row = document.createElement("button")

        row.type = "button"
        row.className = [
          "flex min-h-8 cursor-pointer items-center rounded-field px-2 text-start",
          i === active ? "bg-base-content/10" : "hover:bg-base-content/5",
        ].join(" ")
        row.textContent = `{{${name}}}`
        row.addEventListener("mousedown", e => {
          e.preventDefault()
          current.command(name)
        })

        return row
      }),
    )
    box.hidden = names.length === 0

    const rect = current.clientRect?.()

    if (rect) {
      computePosition({ getBoundingClientRect: () => rect }, box, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        box.style.left = `${x / 16}rem`
        box.style.top = `${y / 16}rem`
      })
    }
  }

  return {
    onStart: (next: SuggestionProps<string>) => {
      props = next
      active = 0
      draw()
    },
    onUpdate: (next: SuggestionProps<string>) => {
      props = next
      active = Math.min(active, Math.max(0, next.items.length - 1))
      draw()
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      const count = props?.items.length ?? 0

      if (!props || count === 0) {
        return false
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        active = (active + (event.key === "ArrowDown" ? 1 : count - 1)) % count
        draw()

        return true
      }

      if (event.key === "Enter" || event.key === "Tab") {
        props.command(props.items[active])

        return true
      }

      return false
    },
    onExit: () => {
      box.remove()
    },
  }
}

export const Variable = Node.create<Options>({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { items: () => BUILTIN_VARIABLES }
  },

  addAttributes() {
    return { name: { default: "" } }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-variable]",
        getAttrs: node => ({ name: node.getAttribute("data-variable") }),
      },
    ]
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-variable": node.attrs.name, class: "variable" },
      `{{${node.attrs.name}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${node.attrs.name}}}`
  },

  markdownTokenizer: {
    name: "variable",
    level: "inline",
    start: src => src.indexOf("{{"),
    tokenize: src => {
      const match = PATTERN.exec(src)

      return match
        ? { type: "variable", raw: match[0], name: match[1] }
        : undefined
    },
  },

  parseMarkdown: token => ({ type: "variable", attrs: { name: token.name } }),

  renderMarkdown: node => `{{${node.attrs?.name}}}`,

  addProseMirrorPlugins() {
    return [
      Suggestion<string>({
        editor: this.editor,
        pluginKey: new PluginKey("variable-suggestion"),
        char: "{{",
        allowSpaces: false,
        items: ({ query }) => {
          const typed = query.replaceAll("}", "")
          const known = this.options.items().filter(n => n.startsWith(typed))

          return NAME.test(typed) && !known.includes(typed)
            ? [...known, typed]
            : known
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: "variable", attrs: { name: props } },
              { type: "text", text: " " },
            ])
            .run()
        },
        render: menu,
      }),
    ]
  },
})
