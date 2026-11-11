import type { ThemedToken } from "shiki/core"
import { createHighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

export type Token = { content: string; light?: string; dark?: string }

const LANGS: Record<string, string> = {
  c: "c",
  h: "c",
  dts: "c",
  dtsi: "c",
  overlay: "c",
  cmake: "cmake",
  txt: "cmake",
  yml: "yaml",
  yaml: "yaml",
  conf: "ini",
  defconfig: "ini",
  nix: "nix",
}

export const languageOf = (path: string) => {
  const name = path.split("/").at(-1) ?? ""

  if (name === "CMakeLists.txt") {
    return "cmake"
  }

  if (name.startsWith("Kconfig")) {
    return "ini"
  }

  return LANGS[name.split(".").at(-1) ?? ""] ?? null
}

const highlighter = createHighlighterCore({
  themes: [
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ],
  langs: [
    import("shiki/langs/c.mjs"),
    import("shiki/langs/cmake.mjs"),
    import("shiki/langs/yaml.mjs"),
    import("shiki/langs/ini.mjs"),
    import("shiki/langs/nix.mjs"),
  ],
  engine: createJavaScriptRegexEngine(),
})

const colorOf = (token: ThemedToken, theme: string) =>
  token.htmlStyle?.[theme === "light" ? "color" : "--shiki-dark"]

export const highlight = async (
  code: string,
  lang: string,
): Promise<Token[][]> => {
  const result = (await highlighter).codeToTokens(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
  })

  return result.tokens.map(line =>
    line.map(t => ({
      content: t.content,
      light: colorOf(t, "light"),
      dark: colorOf(t, "dark"),
    })),
  )
}
